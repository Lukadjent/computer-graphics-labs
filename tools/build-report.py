"""Build the ten-page CGW report from the implementation and its screenshots.

Requires Python, ReportLab and Pillow. Run from the repository root:
    python tools/build-report.py
"""
from pathlib import Path
from html import escape
import os
import textwrap

from PIL import Image as PILImage
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Image, Table, TableStyle,
    Flowable,
)

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs' / 'CGW_variant13_report.pdf'
FONT_DIR = Path(os.environ.get('WINDIR', 'C:/Windows')) / 'Fonts'
for name, filename in [('Body', 'times.ttf'), ('BodyBold', 'timesbd.ttf'),
                       ('BodyItalic', 'timesi.ttf'), ('Code', 'consola.ttf')]:
    pdfmetrics.registerFont(TTFont(name, str(FONT_DIR / filename)))
pdfmetrics.registerFontFamily('Body', normal='Body', bold='BodyBold', italic='BodyItalic', boldItalic='BodyBold')

WIDTH, HEIGHT = A4
MARGIN = 56
CONTENT_WIDTH = WIDTH - 2 * MARGIN
STYLES = {
    'body': ParagraphStyle('Body', fontName='Body', fontSize=12, leading=17,
                           alignment=TA_JUSTIFY, spaceAfter=9),
    'h1': ParagraphStyle('H1', fontName='BodyBold', fontSize=17, leading=22, spaceAfter=17),
    'h2': ParagraphStyle('H2', fontName='BodyBold', fontSize=13, leading=18, spaceBefore=8, spaceAfter=8),
    'caption': ParagraphStyle('Caption', fontName='Body', fontSize=10.5, leading=14,
                              alignment=TA_CENTER, spaceBefore=6, spaceAfter=12),
    'small': ParagraphStyle('Small', fontName='Body', fontSize=10.5, leading=14, spaceAfter=7),
    'cell': ParagraphStyle('Cell', fontName='Body', fontSize=10.5, leading=14),
    'equation': ParagraphStyle('Equation', fontName='BodyItalic', fontSize=13, leading=19,
                               alignment=TA_CENTER, spaceBefore=5, spaceAfter=10),
    'code': ParagraphStyle('Code', fontName='Code', fontSize=9.1, leading=12.1, spaceAfter=0),
}
story = []


def p(text, style='body'):
    story.append(Paragraph(text, STYLES[style]))


def title(text):
    p(text, 'h1')


def sub(text):
    p(text, 'h2')


def equation(text):
    p(text, 'equation')


def next_page():
    story.append(PageBreak())


def table(rows, widths):
    cells = [[Paragraph(escape(str(c)), STYLES['cell']) for c in row] for row in rows]
    t = Table(cells, colWidths=widths, hAlign='LEFT', repeatRows=1)
    t.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 8), ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 7), ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
        ('LINEBELOW', (0, 0), (-1, 0), .7, colors.HexColor('#687680')),
        ('LINEBELOW', (0, 1), (-1, -1), .25, colors.HexColor('#d6dadd')),
    ]))
    story.extend([t, Spacer(1, 10)])


def screenshot(name, width=CONTENT_WIDTH):
    file = ROOT / 'output' / name
    with PILImage.open(file) as im:
        height = width * im.height / im.width
    return Image(str(file), width=width, height=height)


def pair(first, second, first_caption, second_caption):
    w = (CONTENT_WIDTH - 12) / 2
    t = Table([[screenshot(first, w), screenshot(second, w)],
               [Paragraph(first_caption, STYLES['caption']), Paragraph(second_caption, STYLES['caption'])]],
              colWidths=[w + 6, w + 6])
    t.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'),
                          ('LEFTPADDING', (0, 0), (-1, -1), 0),
                          ('RIGHTPADDING', (0, 0), (-1, -1), 6),
                          ('TOPPADDING', (0, 0), (-1, -1), 0),
                          ('BOTTOMPADDING', (0, 0), (-1, -1), 5)]))
    story.append(t)


class MatrixFormula(Flowable):
    """Typeset an affine matrix as PDF vectors and embedded font text."""
    def __init__(self):
        super().__init__()
        self.width = CONTENT_WIDTH
        self.height = 85

    def draw(self):
        c = self.canv
        c.setFont('BodyItalic', 12)
        c.drawString(18, 39, 'M =')
        x, y, w, h = 66, 12, 384, 62
        c.setLineWidth(.8)
        for side, direction in [(x, 1), (x + w, -1)]:
            c.line(side, y, side, y + h)
            c.line(side, y, side + direction * 6, y)
            c.line(side, y + h, side + direction * 6, y + h)
        for row, values in enumerate([['α', '0', '(1 − α)cₛ'], ['0', 'β', '(1 − β)cₜ'], ['0', '0', '1']]):
            for col, value in enumerate(values):
                c.drawCentredString(x + [48, 138, 276][col], y + 45 - 20 * row, value)


def code_block(source):
    # Wrap only for printed layout; all characters come from the actual source.
    for line in source.strip('\n').splitlines():
        for visual in textwrap.wrap(line, width=86, subsequent_indent='    ',
                                    replace_whitespace=False, drop_whitespace=False) or [' ']:
            p(escape(visual).replace(' ', '&#160;'), 'code')
    story.append(Spacer(1, 10))


def extract(filename, start, end):
    text = (ROOT / filename).read_text(encoding='utf-8')
    return text[text.index(start):text.index(end, text.index(start))].rstrip()


def footer(canvas, doc):
    if doc.page > 1:
        canvas.saveState()
        canvas.setFont('Body', 10)
        canvas.setFillColor(colors.HexColor('#66717b'))
        canvas.drawCentredString(WIDTH / 2, 30, str(doc.page))
        canvas.restoreState()


# Page 1: title page.
cover = ParagraphStyle('Cover', fontName='Body', fontSize=13, leading=20, alignment=TA_CENTER)
cover_title = ParagraphStyle('CoverTitle', parent=cover, fontName='BodyBold', fontSize=22, leading=29)
story.append(Spacer(1, 24))
story.append(Paragraph('КПІ ім Ігоря Сікорського', cover))
story.append(Paragraph('Комп’ютерна графіка', cover))
story.append(Spacer(1, 122))
story.append(Paragraph('Розрахункова графічна робота', cover_title))
story.append(Spacer(1, 22))
story.append(Paragraph('Масштабування текстури<br/>навколо опорної точки', cover))
story.append(Spacer(1, 15))
story.append(Paragraph('Варіант 13', cover))
story.append(Spacer(1, 100))
for line in ['Виконавець Лисенко Лука',
             'Група ТР-61МП',
             'Викладач Демчішин Анатолій Анатолійович']:
    story.append(Paragraph(line, ParagraphStyle('Author', parent=cover, alignment=TA_LEFT, leftIndent=104, spaceAfter=12)))
story.append(Spacer(1, 80))
story.append(Paragraph('Київ 2026', cover))
next_page()

# Page 2: one-page task statement.
title('1 Опис завдання')
p('Мета роботи полягає в реалізації масштабування текстурних координат навколо опорної точки, '
  'яку можна переміщувати вздовж параметрів поверхні. Для варіанта 13, що є непарним, '
  'умова передбачає саме масштабування. Основою є текстурована поверхня з контрольної роботи PA3. '
  'Результат має дозволяти безпосередньо порівнювати матеріал за різних коефіцієнтів і положень точки.')
sub('Вхідні дані та успадкована модель')
p('Використано поверхню Ruled Rotor Cylinder з параметрами a = 1, b = 2, n = 2 та '
  '−1.5 ≤ v ≤ 1.5. Матеріал складається з diffuse, specular і normal карт розміром 512 × 512. '
  'Збережено Phong shading, нормалі з вагами площ суміжних трикутників та ортогоналізацію '
  'Gram–Schmidt з пріоритетом дотичної T. Номер варіанта 13 не є значенням параметра n.')
sub('Функціональні вимоги')
p('Необхідно повторно використати текстурування PA3, виконати масштабування навколо '
  'обраної точки та забезпечити її рух у просторі параметрів за допомогою клавіатури. '
  'У реалізації A і D змінюють координату вздовж u, W і S змінюють координату вздовж v. '
  'Користувач також має бачити поточні коефіцієнти та координати точки.')
table([
    ['Вимога', 'Реалізація'],
    ['Масштабування навколо точки', 'Два додатні коефіцієнти та спільна опорна точка UV'],
    ['Переміщення клавіатурою', 'WASD, звичайний крок 0.02 та крок 0.10 з Shift'],
    ['Повторне використання PA3', 'Три узгоджені карти, та сама геометрія й освітлення'],
    ['Представлення результату', 'Гілка CGW, вихідний код, скриншоти та цифровий звіт'],
], [160, CONTENT_WIDTH - 160])
p('Застосунок реалізовано мовою JavaScript із WebGL 1.0, без Three.js. Він відкривається локально '
  'без сервера та доступу до інтернету. Параметри форми, щільність сітки, режим каркаса і керування '
  'світлом залишаються доступними. Масштабування матеріалу не змінює положення вершин чи силует.')
p('Джерело постановки: <link href="https://vggi-kpi.blogspot.com/2022/12/calculation-and-graphics-work.html" '
  'color="#244e64">Calculation and Graphics Work — Operations on texture coordinates</link>. '
  'Вимоги до звіту визначають титульну сторінку, одну сторінку постановки та по дві сторінки '
  'теорії, реалізації, інструкції зі скриншотами й прикладів коду.', 'small')
next_page()

# Pages 3-4: theory.
title('2 Теоретичні відомості')
sub('Параметрична поверхня та координати матеріалу')
p('Точку тривимірної поверхні визначають два незалежні параметри u та v. Перший '
  'проходить замкнений інтервал довжини 2π, другий задає положення вздовж прямолінійної твірної. '
  'Для використаної поверхні координатні функції мають вигляд')
equation('x(u,v) = [a + b sin(nu)] cos u − v sin u')
equation('y(u,v) = [a + b sin(nu)] sin u + v cos u')
equation('z(u,v) = b cos(nu)')
p('Щоб працювати з картами однакового розміру незалежно від діапазону параметрів, '
  'вводять нормовані координати s і t. Вони утворюють прямокутну область поверхні, '
  'а не екранні координати. Обертання моделі не змінює ці значення.')
equation('s = u / (2π), &#160;&#160; t = (v − v<sub>min</sub>) / (v<sub>max</sub> − v<sub>min</sub>)')
p('Позначимо початкову пару координат через q = (s,t), а опорну точку через c = (c<sub>s</sub>, '
  'c<sub>t</sub>). Матриця S має діагональні елементи α та β і нульові недіагональні елементи. '
  'Рівні α та β дають однаковий масштаб за обома напрямками; різні коефіцієнти дозволяють '
  'незалежно змінювати розмір візерунка вздовж кожного параметра.')
sub('Масштабування відносно заданої точки')
p('Спочатку опорну точку переносять у початок координат, віднімаючи c. Потім множать '
  'отриманий вектор на S і додають c, повертаючись у вихідну систему координат. '
  'Послідовність задає афінне перетворення')
equation('q′ = c + S(q − c) = Sq + (I − S)c')
equation('s′ = c<sub>s</sub> + α(s − c<sub>s</sub>), &#160;&#160; t′ = c<sub>t</sub> + β(t − c<sub>t</sub>)')
p('Якщо q збігається з c, відносний вектор дорівнює нулю. Тому q′(c) = c за будь-яких '
  'допустимих коефіцієнтів. Якщо α = β = 1, перетворення тотожне. За цих умов '
  'переміщення опорної точки не повинно змінювати саме зображення матеріалу.')
p('Поверхню та її параметризацію наведено за S. N. Krivoshapko, V. N. Ivanov, '
  '<i>Encyclopedia of Analytical Surfaces</i>, Springer, 2015, с. 80. '
  'Використано той самий скінченний фрагмент, що й у PA1–PA3.', 'small')
next_page()

title('2 Теоретичні відомості')
sub('Композиція перенесень і масштабування')
p('В однорідних координатах перенесення та масштабування можна об’єднати в одну матрицю. '
  'Для стовпця (s,t,1) загальний порядок дорівнює T(c) · S · T(−c). '
  'Він принциповий, адже без завершального перенесення опорна точка не залишилася б на місці.')
story.append(MatrixFormula())
p('У програмі використано алгебраїчно тотожну форму q′ = q + (S − I)(q − c). '
  'Вона має числову перевагу: за S = I доданок точно нульовий, отже не виникає '
  'малих змін UV від віднімання та повторного додавання c. Подальші повтори матеріалу '
  'з PA3 застосовуються після масштабування.')
equation('st = (r<sub>s</sub>s′, r<sub>t</sub>t′)')
p('Наприклад, для c = (0.25,0.5), q = (0.4,0.7), α = 2, β = 0.5 та r = (1,1) '
  'одержуємо st = (0.55,0.6). Якщо α = 2, координата вибірки змінюється вдвічі '
  'швидше вздовж s: видимі елементи текстури стають удвічі дрібнішими. '
  'Тому масштаб координат і видимий розмір візерунка мають обернену залежність.')
sub('Періодичність і нормалі матеріалу')
p('Після перетворення координати можуть виходити за [0,1]. Режим sampler REPEAT '
  'циклічно повторює карту, зокрема для від’ємних координат. У шейдері не викликається '
  'fract, щоб не створювати додаткових розривів похідних для вибору mip-рівня. '
  'На замкненому u-шві різниця координат вибірки становить r<sub>s</sub>α. '
  'Безшовне замикання візерунка потребує цілого значення цього добутку.')
p('Diffuse, specular і normal карти читаються за одними координатами st, тому їхні '
  'деталі залишаються узгодженими. Додатні α та β зберігають напрями дотичних осей T і B. '
  'Декодована normal map використовує базис PA3; геометричні нормалі та вершини не '
  'змінюються. Карта трактується як декоративне поле орієнтацій, її компоненти не '
  'перераховуються як похідні нової карти висот.')
equation('T = normalize(P<sub>u</sub>), &#160;&#160; N = normalize(N<sub>0</sub> − T(N<sub>0</sub> · T))')
equation('B = normalize(N × T), &#160;&#160; N<sub>pixel</sub> = normalize(TBN · n<sub>map</sub>)')
next_page()

# Pages 5-6: implementation.
title('3 Реалізація програми')
sub('Розподіл відповідальності')
p('Робоча гілка CGW продовжує PA3. Код геометрії залишено в Model.js, а новий стан '
  'текстури додано до main.js. Перетворення виконується у фрагментному шейдері перед '
  'вибіркою карт. Це дає змогу змінювати матеріал без повторного формування сітки.')
table([
    ['Файл', 'Відповідальність'],
    ['Model.js', 'P(u,v), трикутники, нормалі, дотичні, UV та GPU-буфери'],
    ['main.js', 'textureTransform, події, схема UV, uniforms, світло й маркер'],
    ['shader.gpu', 'Перетворення координат, вибір трьох карт, TBN і Phong'],
    ['index.html і styles.css', 'Коефіцієнти, координати точки, керування й компонування'],
    ['TextureData.js і textures/', 'Три карти 512 × 512 та їхні вбудовані копії'],
], [155, CONTENT_WIDTH - 155])
sub('Стан та шлях даних')
p('Об’єкт textureTransform містить pivot = [0.25,0.5] і scale = [1,1]. '
  'Повзунки обмежують коефіцієнти діапазоном 0.25–4. Позначка зв’язування осей '
  'копіює змінений коефіцієнт на іншу вісь. Функція syncTextureControls оновлює '
  'числа в інтерфейсі, фактичні u та v і схему параметрів.')
p('Під час draw значення надходять у TexturePivot та TextureScale. До них '
  'додаються успадковані TextureRepeat та параметри матеріалу. Змінна mappedUV '
  'обчислюється з інтерпольованого uv; одна пара st використовується у трьох '
  'викликах texture2D. Вершинні атрибути при зміні масштабу не оновлюються.')
p('Типова сітка 96 × 20 містить 2037 GPU-вершин з UV-копіями на шві, '
  '3840 трикутників та 11520 індексів Uint16. За найбільшої щільності 256 × 80 '
  'кількість вершин дорівнює 20817. Геометрія перебудовується лише після зміни '
  'параметрів форми або щільності. Переміщення точки оновлює також допоміжний '
  'динамічний буфер маркера, який не є буфером поверхні.')
p('Маркери й каркас використовують ту саму матрицю виду. Для опорної точки '
  'обчислюється точна P(2πc<sub>s</sub>, v<sub>min</sub> + c<sub>t</sub>(v<sub>max</sub> − v<sub>min</sub>)). '
  'Окремий gl.POINTS формує круглий диск сталого розміру через gl_PointCoord. '
  'Його малюють поверх моделі без перевірки глибини, щоб точка залишалася помітною.')
next_page()

title('3 Реалізація програми')
sub('Клавіатура та межі параметрів')
p('Обробник keydown використовує KeyboardEvent.code: KeyA і KeyD задають '
  'від’ємний та додатний рух s, KeyW і KeyS задають додатний та від’ємний рух t. '
  'Одна подія змінює координату на 0.02, з Shift — на 0.10. Фізичні коди '
  'працюють незалежно від української чи англійської розкладки.')
p('У setTexturePivot координату s нормалізують подвійним остачевим діленням '
  '((s % 1) + 1) % 1. Це коректно обробляє від’ємні значення JavaScript. '
  'Координату t обмежують через max і min. Поля перевіряють число та діапазон '
  'до зміни стану. Системні комбінації й редагування INPUT, TEXTAREA, SELECT '
  'або contenteditable не перехоплюються.')
sub('Перевірка фактичного шейдера')
p('Окремий GPU-приклад використовує робочий фрагментний шейдер, тестовий '
  'трикутник та карту 8 × 8. Її texel з індексами x,y кодується як '
  'RGBA = (30x,30y,80,255). Фільтр NEAREST дає однозначно порівняти '
  'незалежно розраховану координату з прочитаним через readPixels кольором.')
table([
    ['Випадок', 'Очікуване та отримане RGBA'],
    ['q=c=(0.25,0.5), S=(1,1)', '(60,120,80,255)'],
    ['Та сама q=c, S=(3,0.25)', '(60,120,80,255)'],
    ['q=(0.4,0.7), S=(2,0.5), r=(1,1)', '(120,120,80,255)'],
    ['q=(0.1,0.1), S=(3,2), r=(2,1)', '(120,150,80,255)'],
], [280, CONTENT_WIDTH - 280])
p('Перші два рядки підтверджують збереження вибірки в опорній точці. Третій '
  'підтверджує незалежні масштаби осей, четвертий перевіряє REPEAT за від’ємних '
  'проміжних координат. Також порівняно кадри при S=(1,1) та різних c: '
  'без маркера вони збігаються точно.')
p('Інтерактивні перевірки охопили всі напрями WASD, Shift, перехід через '
  'шов u та обмеження v, фокус полів, неправильне введення, клацання схеми, '
  'незмінність буферів поверхні, окремий внесок усіх карт, максимальну '
  'щільність, збереження PNG і вузьке вікно 390 пікселів. Помилок JavaScript '
  'і WebGL не виявлено. Успадковану геометрію перевіряє node tools/check.cjs.')
next_page()

# Pages 7-8: illustrated instructions.
title('4 Інструкція користувача')
sub('Запуск і основні елементи')
p('Відкрийте index.html у Chrome, Edge або Firefox. Встановлення пакетів '
  'та інтернет не потрібні. За потреби запустіть node tools/serve.cjs '
  'і відкрийте http://127.0.0.1:8765. Ліва панель містить налаштування '
  'масштабу та опорної точки, праворуч показана модель.')
story.append(screenshot('CGW_variant13_full.png', CONTENT_WIDTH - 10))
p('Рисунок 1 Загальний інтерфейс при масштабі 1 і точці (0.25,0.5)', 'caption')
p('Перетягування обертає модель, коліщатко змінює її розмір у вікні. '
  'Ці дії не змінюють координати матеріалу. Щоб порівняння масштабів було '
  'зручним, у розділі освітлення зупиніть обертання джерела. '
  'Кнопка «Знімок PNG» зберігає зображення моделі, а посилання внизу відкриває звіт.')
p('Розділи матеріалу, сітки, світла й параметрів поверхні розгортаються '
  'окремо. У них збережені можливості PA3: три карти, сила normal mapping, '
  'повтори, режими перегляду карт, каркас та параметри форми.')
next_page()

title('4 Інструкція користувача')
sub('Масштаб і переміщення опорної точки')
p('1. Залиште ввімкненим однаковий масштаб s/t і встановіть коефіцієнт 2. '
  'Порівняйте розмір деталей із коефіцієнтом 1. Для незалежного '
  'масштабування вимкніть зв’язування осей та задайте різні значення.')
pair('CGW_variant13_identity.png', 'CGW_variant13_scaled.png',
     'Рисунок 2 Масштаб (1,1)', 'Рисунок 3 Масштаб (2,2)')
p('2. При масштабі 2 клацніть модель і натисніть D сім разів. Координата '
  's зміниться з 0.25 до 0.39. W переміщує точку до більшого v, S — до '
  'меншого. Shift збільшує крок. Точку також можна задати числом або '
  'клацанням схеми. Жовтий маркер показаний поверх моделі.')
pair('CGW_variant13_moved.png', 'CGW_variant13_anisotropic.png',
     'Рисунок 4 c=(0.39,0.5), S=(2,2)', 'Рисунок 5 c=(0.39,0.5), S=(2,0.5)')
p('3. Натисніть «Скинути масштаб і точку», щоб повернути S=(1,1) '
  'та c=(0.25,0.5). Кнопка «Скинути вигляд» окремо повертає ракурс '
  'і масштаб моделі. Якщо WASD не переміщує точку, заберіть фокус '
  'із поля введення, клацнувши модель або схему параметрів.')
p('На межі s=1 точка переходить до s=0, а t зупиняється на 0 або 1. '
  'За довільного масштабу може бути помітний шов візерунка; для його '
  'замикання обирайте ціле значення repeatU × scaleU.', 'small')
next_page()

# Pages 9-10: actual source excerpts.
title('5 Приклади вихідного коду')
sub('Фрагментний шейдер і вибір карт')
p('Наведено фрагменти shader.gpu. Опорна точка й коефіцієнти передаються '
  'окремими uniforms. Інтерпольовані uv не змінюють геометрію: '
  'перетворення впливає лише на координати читання матеріалу.')
code_block(extract('shader.gpu', 'uniform sampler2D DiffuseMap;', 'varying vec3 positionEye;'))
code_block(extract('shader.gpu', '    // Перенести опорну точку', '    if (DisplayMode == 1)'))
sub('Дотичний базис з PA3')
p('T має пріоритет при ортогоналізації. Карта нормалей читається за '
  'тими самими st, що й diffuse/specular, а отримана нормаль '
  'переноситься до координат спостерігача через TBN.')
code_block(extract('shader.gpu', '    vec3 T = normalize(tangentEye);', '    if (!gl_FrontFacing)'))
p('Код скопійовано з поточної реалізації. На цій сторінці пропущені '
  'допоміжний маркер, режими показу карт та завершальна формула Phong; '
  'повний шейдер міститься в репозиторії.', 'small')
next_page()

title('5 Приклади вихідного коду')
sub('Стан точки та події клавіатури')
p('У main.js нова точка спочатку нормалізується відповідно до '
  'топології області параметрів, після чого оновлюються елементи '
  'інтерфейсу та кадр. Геометрія поверхні тут не перебудовується.')
code_block(extract('main.js', 'const textureTransform =', 'function syncTextureControls()'))
p('Обробник клавіатури використовує фізичні коди клавіш та перевіряє '
  'фокус. Утримування клавіші породжує повторні події браузера. '
  'Переміщення завжди обчислюється від поточного стану.')
code_block(extract('main.js', "    window.addEventListener('keydown'", '    syncTextureControls();\n}'))
sub('Передавання параметрів до шейдера')
code_block(extract('main.js', '    gl.uniform2fv(shProgram.TexturePivot', '    gl.uniform1f(shProgram.NormalStrength'))
p('Отже, динамічні параметри текстури передаються як uniforms. '
  'BufferData викликається при зміні форми чи щільності, а масштаб '
  'і опорна точка впливають на читання карт у поточному кадрі. '
  'Так зберігається сітка, текстурний базис і структура PA3.')

OUT.parent.mkdir(parents=True, exist_ok=True)
doc = SimpleDocTemplate(str(OUT), pagesize=A4, rightMargin=MARGIN, leftMargin=MARGIN,
                        topMargin=48, bottomMargin=47,
                        title='Масштабування текстури навколо опорної точки Варіант 13',
                        author='', subject='Розрахункова графічна робота CGW',
                        pageCompression=1)
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print(OUT)
