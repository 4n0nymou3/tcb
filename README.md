<div align="right" dir="rtl">

# Tunnel Config Builder (TCB) v3.9

ابزار ساخت کانفیگ VLESS برای Cloudflare Workers — بدون نیاز به VPS یا سرور شخصی

## معرفی

Tunnel Config Builder یک ابزار تحت وب است که به شما امکان می‌دهد بدون هیچ هزینه‌ای و تنها با استفاده از سرویس رایگان Cloudflare Workers، کانفیگ‌های VLESS بسازید. تمام مراحل از ساخت Worker تا تولید کانفیگ در همین صفحه انجام می‌شود.

## ویژگی‌ها

- ساخت و دانلود مستقیم فایل Worker با Token جاسازی‌شده
- تولید UUID اتوماتیک یا استفاده از UUID دلخواه
- پشتیبانی از پورت‌های TLS: 443، 8443، 2053، 2083، 2087، 2096
- پشتیبانی از پورت‌های WebSocket بدون TLS: 80، 8080، 8880، 2052، 2082، 2086، 2095
- پشتیبانی از چند IP و دامنه همزمان
- انتخاب TLS Fingerprint از ۱۰ گزینه برای دور زدن DPI
- انتخاب مسیر WebSocket Path
- تنظیمات Fragment برای مقابله با فیلترینگ عمیق
- تنظیمات پیشرفته JSON: Fake DNS، IPv6، Allow LAN، TCP Fast Open، Local DNS، Remote DNS / DoH
- پشتیبانی از ECH برای رمزنگاری Client Hello و پنهان کردن SNI از دید DPI
- خروجی JSON با قابلیت least ping برای Xray
- تبدیل کانفیگ به فرمت Sing-box از طریق ابزار Drill

## نحوه استفاده

### مرحله ۱ — ساخت Worker در Cloudflare

۱. به [dash.cloudflare.com](https://dash.cloudflare.com) بروید و وارد حساب کاربری خود شوید.

۲. از منو Workers and Pages را انتخاب کنید، روی Create Application کلیک کنید، گزینه Create Worker را بزنید، یک نام دلخواه وارد کنید و Deploy کنید.

### مرحله ۲ — تنظیم Token و آپلود کد

۱. در ابزار، یک Token جدید بسازید یا UUID دلخواه خود را مستقیم در کادر وارد کنید.

۲. کد Worker که به‌صورت خودکار با Token شما آپدیت شده را با دکمه کپی کد کپی کنید، یا با دکمه دانلود `.js` فایل `worker.js` را دانلود کنید.

۳. در داشبورد Cloudflare روی Edit Code کلیک کنید، کد پیش‌فرض را پاک کنید، کد کپی‌شده را Paste کنید و Deploy کنید.

۴. آدرسی که Cloudflare بعد از Deploy نمایش می‌دهد (مثل `myworker.username.workers.dev`) را کپی کنید.

### مرحله ۳ — ساخت کانفیگ

۱. آدرس Worker را در فیلد مربوطه وارد کنید.

۲. IP های سالم Cloudflare را در کادر مربوطه وارد کنید. علاوه بر IP، می‌توانید از برخی دامنه‌ها نیز استفاده کنید (مثلاً chatgpt.com). برای یافتن IP های سالم می‌توانید از ابزار [Clean IP Scanner](https://github.com/4n0nymou3/Clean-IP-Scanner) استفاده کنید.

۳. پورت‌های TLS و WebSocket مورد نظر را انتخاب کنید.

۴. TLS Fingerprint و مسیر WebSocket Path را انتخاب کنید.

۵. در صورت تمایل، تنظیمات Fragment را فعال کرده و مقادیر دلخواه را وارد کنید.

۶. در صورت تمایل، تنظیمات پیشرفته JSON را بر اساس نیاز خود تغییر دهید.

۷. روی ساخت کانفیگ کلیک کنید.

### مرحله ۴ — استفاده از کانفیگ‌ها

- کانفیگ‌های VLESS تولید شده را در v2rayNG یا کلاینت‌های مشابه وارد کنید.
- کانفیگ JSON خروجی را در کلاینت‌های سازگار با Xray مانند v2rayNG وارد کنید تا از حالت least ping بهره‌مند شوید.
- برای تبدیل کانفیگ‌ها به فرمت Sing-box از ابزار [Drill](https://4n0nymou3.github.io/proxy-to-singbox-converter/) استفاده کنید.

## راهنمای تنظیمات

### TLS Fingerprint

این تنظیم مشخص می‌کند که کلاینت شما در TLS handshake خود را به عنوان چه مرورگر یا دستگاهی معرفی کند. سیستم‌های DPI با بررسی الگوی TLS می‌توانند ترافیک پروکسی را تشخیص دهند؛ انتخاب یک Fingerprint معمول مثل chrome یا firefox این تشخیص را دشوارتر می‌کند. گزینه‌های موجود:

`chrome` — `firefox` — `safari` — `ios` — `android` — `edge` — `360` — `qq` — `random` — `randomized`

### WebSocket Path

مسیر WebSocket که در کانفیگ‌ها استفاده می‌شود. گزینه‌های موجود: `/vless`، `/proxy`، `/v2ray`، `/ws`، `/`

### Fragment

با فعال کردن Fragment، داده‌های TLS handshake به قطعات کوچک‌تر تقسیم می‌شوند که تشخیص آن توسط DPI را دشوارتر می‌کند. این تنظیم فقط در کانفیگ JSON اعمال می‌شود و روی کانفیگ‌های VLESS تأثیری ندارد. Fragment و ECH را نمی‌توان همزمان فعال کرد.

تنظیمات Fragment:
- **Fragment Packets**: نوع داده‌ای که Fragment می‌شود. مقدار `tlshello` برای تقطیع TLS Client Hello توصیه می‌شود.
- **Fragment Interval**: فاصله زمانی بین ارسال قطعات (میلی‌ثانیه).
- **Fragment Length**: اندازه هر قطعه (بایت).

### ECH — Encrypted Client Hello

ECH یک لایه رمزنگاری اضافه روی TLS handshake است که نام دامنه مقصد (SNI) را از دید سیستم‌های DPI پنهان می‌کند. با فعال کردن ECH، Xray کلید رمزنگاری دامنه Worker شما را به صورت خودکار از سرور DNS دریافت می‌کند و Client Hello را قبل از ارسال رمزنگاری می‌کند.

فعال کردن چک‌باکس به‌تنهایی کافی است. آدرس پیش‌فرض در کادر DNS (DoH Cloudflare) برای اکثر کاربران مناسب است. اگر DoH Proxy شخصی دارید، آدرس آن را جایگزین کنید تا پایداری بیشتری داشته باشید. ECH فقط در کانفیگ JSON Normal (بدون Fragment) اعمال می‌شود.

### تنظیمات پیشرفته JSON

- **Fake DNS**: DNS جعلی برای بهبود سرعت resolve در کلاینت.
- **IPv6**: فعال یا غیرفعال کردن پشتیبانی از IPv6.
- **Allow LAN**: امکان استفاده سایر دستگاه‌های شبکه محلی از پروکسی.
- **TCP Fast Open**: بهبود سرعت اتصال با کاهش تأخیر handshake.
- **Local DNS**: سرور DNS برای resolve دامنه‌های ایرانی (پیش‌فرض: 8.8.8.8).
- **Remote DNS / DoH**: سرور DNS برای ترافیک خارج از ایران (پیش‌فرض: DoH Cloudflare). می‌توانید از ابزار [DoH Proxy](https://github.com/4n0nymou3/cloudflare-doh-proxy) یک سرور DoH اختصاصی روی Cloudflare بسازید.

## اجرای آفلاین روی دستگاه شخصی

اگر می‌خواهید این ابزار را بدون نیاز به اینترنت، مستقیماً روی دستگاه خودتان اجرا کنید، مراحل زیر را دنبال کنید.

### ابزارهای مورد نیاز

برای اجرای محلی این پروژه به دو چیز نیاز دارید:

- **Git** — برای دانلود فایل‌های پروژه از GitHub
- **Python** — برای راه‌اندازی یک سرور محلی ساده

---

### مرحله ۱ — نصب Git (در صورت نیاز)

اگر Git روی سیستم شما نصب نیست، ابتدا آن را نصب کنید:

**لینوکس (Ubuntu/Debian):**

</div>

```sh
sudo apt install git
```

<div align="right" dir="rtl">

**مک (macOS):**

</div>

```sh
brew install git
```

<div align="right" dir="rtl">

**ویندوز:** از [git-scm.com](https://git-scm.com) نصب‌کننده را دانلود و اجرا کنید.

**Termux روی اندروید:**

</div>

```sh
pkg install git
```

<div align="right" dir="rtl">

**iSH روی iOS:**

</div>

```sh
apk add git
```

---

<div align="right" dir="rtl">

### مرحله ۲ — Clone کردن پروژه

با دستور زیر، تمام فایل‌های پروژه از GitHub روی دستگاه شما دانلود می‌شود:

</div>

```sh
git clone https://github.com/4n0nymou3/cf-vless-config-builder.git
```

<div align="right" dir="rtl">

> **توضیح:** دستور `git clone` یعنی «یک کپی کامل از این پروژه برایم بساز». بعد از اجرا، یک پوشه با نام `cf-vless-config-builder` در مسیر جاری شما ایجاد می‌شود.

---

### مرحله ۳ — رفتن به داخل پوشه پروژه

</div>

```sh
cd cf-vless-config-builder
```

<div align="right" dir="rtl">

> **توضیح:** دستور `cd` یعنی «وارد این پوشه شو». باید حتماً این مرحله را انجام دهید، وگرنه مراحل بعدی کار نمی‌کنند.

---

### مرحله ۴ — نصب Python (در صورت نیاز)

Python معمولاً روی لینوکس و مک از قبل نصب است. اگر نصب نبود:

**لینوکس (Ubuntu/Debian):**

</div>

```sh
sudo apt install python3
```

<div align="right" dir="rtl">

**مک (macOS):**

</div>

```sh
brew install python3
```

<div align="right" dir="rtl">

**ویندوز:** از [python.org](https://python.org) نصب‌کننده را دانلود کنید. در حین نصب گزینه **Add Python to PATH** را حتماً تیک بزنید.

**Termux روی اندروید:**

</div>

```sh
pkg install python
```

<div align="right" dir="rtl">

**iSH روی iOS:**

</div>

```sh
apk add python3
```

---

<div align="right" dir="rtl">

### مرحله ۵ — راه‌اندازی سرور محلی

این ابزار یک صفحه وب است و برای اجرای درست به یک سرور نیاز دارد. Python این سرور ساده را برای شما می‌سازد.

بسته به نسخه Python نصب‌شده روی سیستم، یکی از دستورات زیر را اجرا کنید:

**Python 3 (لینوکس، مک، ویندوز، Termux):**

</div>

```sh
python -m http.server 8080
```

<div align="right" dir="rtl">

**Python 3 روی iSH:**

</div>

```sh
python3 -m http.server 8080
```

<div align="right" dir="rtl">

**Python 2 (نسخه قدیمی):**

</div>

```sh
python -m SimpleHTTPServer 8080
```

<div align="right" dir="rtl">

> **توضیح:** عدد `8080` شماره پورت است. اگر این پورت اشغال بود می‌توانید عدد دیگری مثل `8000` یا `9090` را جایگزین کنید.

وقتی سرور با موفقیت اجرا شود، چیزی شبیه به این می‌بینید:

</div>

```
Serving HTTP on 0.0.0.0 port 8080 ...
```

---

<div align="right" dir="rtl">

### مرحله ۶ — باز کردن ابزار در مرورگر

مرورگر خود را باز کنید و آدرس زیر را وارد کنید:

</div>

```
http://localhost:8080
```

<div align="right" dir="rtl">

---

### متوقف کردن سرور

وقتی کارتان تمام شد، برای خاموش کردن سرور کافیست در همان پنجره ترمینال کلیدهای زیر را بزنید:

</div>

```
Ctrl + C
```

<div align="right" dir="rtl">

#### اگر ترمینال را اشتباهاً بستید

گاهی پیش می‌آید که پنجره ترمینال را می‌بندید، اما سرور همچنان در پس‌زمینه در حال اجراست و پورت ۸۰۸۰ را اشغال کرده. در این حالت دفعه بعد که بخواهید سرور را دوباره راه‌اندازی کنید، با خطا مواجه می‌شوید.

برای حل این مشکل، دو دستور زیر را به ترتیب اجرا کنید:

**اول — پیدا کردن برنامه‌ای که پورت ۸۰۸۰ را اشغال کرده:**

</div>

```sh
lsof -i :8080
```

<div align="right" dir="rtl">

این دستور یک جدول نمایش می‌دهد. در ستون `PID` یک عدد می‌بینید — آن عدد شناسه (ID) برنامه‌ای است که باید بسته شود.

**دوم — بستن آن برنامه با شناسه‌اش:**

</div>

```sh
kill -9 PID
```

<div align="right" dir="rtl">

به جای `PID` عدد واقعی را از خروجی دستور قبل وارد کنید. مثلاً اگر عدد `2341` بود:

</div>

```sh
kill -9 2341
```

---

<div align="right" dir="rtl">

## ابزارهای مرتبط

- [Clean IP Scanner](https://github.com/4n0nymou3/Clean-IP-Scanner) — یافتن IP های سالم Cloudflare با Termux روی اندروید
- [DoH Proxy](https://github.com/4n0nymou3/cloudflare-doh-proxy) — ساخت سرور DNS over HTTPS اختصاصی روی Cloudflare
- [Drill](https://4n0nymou3.github.io/proxy-to-singbox-converter/) — تبدیل کانفیگ‌های VLESS به فرمت Sing-box

## مجوز

این پروژه تحت [مجوز MIT](LICENSE) منتشر شده است — استفاده آزاد

---

## سازنده

طراحی و توسعه توسط: **Anonymous**

ارتباط: [Telegram](https://t.me/BXAMbot)

---

## حمایت از پروژه

اگر این ابزار برای شما مفید بود:

- ⭐ یک Star به repository بدهید
- آن را با دوستانتان به اشتراک بگذارید

</div>