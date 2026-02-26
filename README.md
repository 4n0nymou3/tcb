# Tunnel Config Builder

ابزار ساخت کانفیگ VLESS برای Cloudflare Workers — بدون نیاز به VPS یا سرور شخصی

## معرفی

Tunnel Config Builder یک ابزار تحت وب است که به شما امکان می‌دهد بدون هیچ هزینه‌ای و تنها با استفاده از سرویس رایگان Cloudflare Workers، کانفیگ‌های VLESS بسازید. تمام مراحل از ساخت Worker تا تولید کانفیگ در همین صفحه انجام می‌شود.

## ویژگی‌ها

- ساخت و دانلود مستقیم فایل Worker با Token جاسازی‌شده
- تولید UUID اتوماتیک یا استفاده از UUID دلخواه
- پشتیبانی از پورت‌های TLS و WebSocket
- پشتیبانی از چند IP یا Domain همزمان
- انتخاب TLS Fingerprint برای دور زدن DPI
- خروجی JSON با قابلیت least ping برای Xray
- تنظیمات Fragment برای مقابله با فیلترینگ عمیق
- تبدیل کانفیگ به فرمت Sing-box از طریق ابزار Drill

## نحوه استفاده

### مرحله ۱ — ساخت Worker در Cloudflare

1. به [dash.cloudflare.com](https://dash.cloudflare.com) بروید و وارد حساب کاربری خود شوید.
2. از منو Workers and Pages را انتخاب کنید، روی Create Application کلیک کنید، گزینه Create Worker را بزنید، یک نام دلخواه وارد کنید و Deploy کنید.
3. در صفحه Worker به Settings بروید، بخش Compatibility را باز کنید و در قسمت Compatibility flags عبارت `nodejs_compat` را اضافه کنید و Save کنید. بدون این مرحله Worker کار نخواهد کرد.

### مرحله ۲ — تنظیم Token و آپلود کد

1. در ابزار، یک Token جدید بسازید یا UUID دلخواه خود را مستقیم در کادر وارد کنید.
2. کد Worker که به‌صورت خودکار با Token شما آپدیت شده را با دکمه کپی کد کپی کنید، یا با دکمه دانلود .js فایل `worker.js` را دانلود کنید.
3. در داشبورد Cloudflare روی Edit Code کلیک کنید، کد پیش‌فرض را پاک کنید، کد کپی‌شده را Paste کنید و Deploy کنید.
4. آدرسی که Cloudflare بعد از Deploy نمایش می‌دهد (مثل `myworker.username.workers.dev`) را کپی کنید.

### مرحله ۳ — ساخت کانفیگ

1. آدرس Worker را در فیلد مربوطه وارد کنید.
2. IP های سالم Cloudflare را در کادر مربوطه وارد کنید. برای یافتن IP های سالم می‌توانید از ابزار [CF Clean IP Scanner](https://github.com/4n0nymou3/CF-Clean-IP-Scanner) استفاده کنید.
3. پورت‌ها، Fingerprint و Path مورد نظر را انتخاب کنید.
4. در صورت تمایل، تنظیمات Fragment را فعال کرده و مقادیر دلخواه را وارد کنید.
5. روی ساخت کانفیگ کلیک کنید.

### مرحله ۴ — استفاده از کانفیگ‌ها

- کانفیگ‌های VLESS تولید شده را در v2rayNG یا کلاینت‌های مشابه وارد کنید.
- کانفیگ JSON خروجی را در کلاینت‌های سازگار با Xray مانند v2rayNG وارد کنید تا از حالت least ping بهره‌مند شوید.
- برای تبدیل کانفیگ‌ها به فرمت Sing-box از ابزار [Drill](https://4n0nymou3.github.io/proxy-to-singbox-converter/) استفاده کنید.

## ابزارهای مرتبط

- [CF Clean IP Scanner](https://github.com/4n0nymou3/CF-Clean-IP-Scanner) — یافتن IP های سالم Cloudflare با Termux روی اندروید
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