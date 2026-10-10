<div align="center">

[فارسی](README.md) | [**English**](README_EN.md)

</div>

<div align="left" dir="ltr">

# Tunnel Config Builder (TCB) v7.0

A tool for building VLESS and Trojan configs for Cloudflare Workers and Cloudflare Pages — no VPS or personal server required

## Overview

Tunnel Config Builder is a web-based tool that lets you build VLESS and Trojan configs at no cost, using only the free Cloudflare Workers or Cloudflare Pages service. Every step, from creating the Worker/Pages project to generating the configs, happens right on this page.

## Features

- Simultaneous support for both VLESS and Trojan protocols on a single Worker or Pages project — with the option to enable only VLESS, only Trojan, or both at once
- **Support for deploying on Cloudflare Pages alongside Cloudflare Workers** — the exact same code runs on both services; for Pages, simply upload the ZIP file containing `_worker.js` through Cloudflare Pages' direct upload option
- Direct build and download of the Worker file, or the dedicated Pages ZIP file, both with the Token (VLESS) and Password (Trojan) embedded
- **Fallback Domain**: when set, unauthorized visitors who open the Worker/Pages address directly see the content of a real domain of your choice instead of a blank response
- Automatic UUID and Password generation, or use your own custom values
- Support for TLS ports: 443, 8443, 2053, 2083, 2087, 2096
- Support for WebSocket ports without TLS: 80, 8080, 8880, 2052, 2082, 2086, 2095 (Worker deployment only; Cloudflare Pages permanently and completely lacks support for these ports)
- Support for multiple IPs and domains at once
- TLS Fingerprint selection from 10 options to bypass DPI
- WebSocket Path selection
- Fragment settings to counter deep packet inspection filtering
- Advanced JSON settings: Fake DNS, IPv6, Allow LAN, TCP Fast Open, Local DNS, Remote DNS / DoH
- ECH support to encrypt the Client Hello and hide the SNI from DPI systems
- Configurable routing rules: select Iran, China, and Russia for direct routing (Bypass), and select the Ads, Porn, QUIC, Malware, Phishing, and Cryptominers categories for blocking; both groups apply simultaneously across all three output formats (Xray, Sing-box, Clash)
- **Bypass Sanctions**: direct routing for sanctioned services (OpenAI, Google AIs, Anthropic, xAI, Microsoft, Oracle, Docker, Adobe, Epic Games, Intel, AMD, Nvidia, Asus, HP, Lenovo) using a configurable anti-sanction DNS (default: 178.22.122.100), even if your outbound IP is detected as Iranian
- **Custom Routing Rules**: two text boxes for entering your own domains/IPs/CIDRs to directly Bypass or Block, independent of the built-in categories above
- User-editable Observatory Settings (leastPing/leastLoad interval, mode, sampling, timeout) for the Xray core
- Chain Proxy — the ability to chain TCB configs to an external server (VLESS, Trojan, Shadowsocks, SOCKS5, or HTTP) to keep the outbound IP fixed, across all three JSON output formats (Xray, Sing-box, Clash)
- JSON config dedicated to the Xray core, based on the latest known structure and rules of that core (including advanced Finalmask/Fragment)
- Simultaneous generation of configs in four formats: VLESS/Trojan link, JSON for the Xray core (with least-ping support), JSON for Sing-box, and JSON for Clash / Mihomo
- Smart config naming: each config's name is automatically determined by its state (Normal, Fragment, or ECH) and applied consistently across all three JSON/YAML output formats (Xray, Sing-box, Clash) as well as the downloaded file names; you can also set a custom name for your config if you'd like
- Export and import of all page settings as a single file, for backup or quick settings transfer
- One-click dedicated QR Code display for each config — generated fully offline with no external service or API required
- Unique naming for every single link-format config (including protocol, IP number, and port) so no two configs share the same name
- A "🔄 Clear All & Start Over" button for instantly restoring the panel to its initial state and securely wiping all entered information — suited for use on public or shared computers
- Step-by-step guide for connecting a custom domain to the Worker (entirely through Cloudflare's official dashboard, with no token or extra setup required in TCB)
- **Telegram WEB Proxy**: build a Telegram WEB proxy on Cloudflare Workers and Durable Objects alongside VLESS and Trojan, with no VPS; a ready-to-deploy package (Worker or Pages) is downloaded straight from the panel (guide: [Telegram WEB Proxy](#telegram-web-proxy))

## Limitations

- **Voice/video calls (UDP)**: Cloudflare Workers currently only supports outbound TCP connections, not UDP. Because of this, like any similar tool built on Cloudflare Workers, UDP traffic (including Telegram voice/video calls or similar apps) doesn't work correctly through TCB configs. This is a fundamental limitation of the Cloudflare Workers platform itself, not something fixable by changing the Worker/Pages code.
- **Daily request limit**: The Cloudflare Workers free plan supports 100,000 requests per day. This is typically more than enough for personal or small-group use.
- **Minimum client version for ECH**: ECH support in Sing-box and in Clash/Mihomo is relatively recent. If your Sing-box or Clash configs don't connect with ECH enabled, make sure your client is updated to its latest version.

## How to Use

### Step 1 — Create a Worker or Pages Project on Cloudflare

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) and sign in to your account.

2. **For a Worker:** from the menu, select Workers and Pages, click Create Application, choose Create Worker, enter a name of your choice, and deploy it.

**For Pages:** on the same "Ship something new" screen, scroll down and click "Looking to deploy Pages? Get started", then choose "Drag and drop your files". Instead of Edit Code, you'll drop the dedicated Pages ZIP file (downloaded from the tool in the next step) directly onto that page and click Deploy site.

### Step 2 — Configure the Token and Upload the Code

1. In the tool, generate a new Token, or enter your own custom UUID directly into the field. To use the Trojan protocol, generate a Password the same way, or enter your own custom value.

2. In the code section, select the **Worker** or **Pages** tab depending on which one you set up in Step 1.

3. **For a Worker:** copy the Worker code — which has already been automatically updated with your Token and Password — using the copy code button, or download the `worker.js` file with the download `.js` button; in the Cloudflare dashboard, click Edit Code, delete the default code, paste the copied code, and deploy.

**For Pages:** click the "↓ Download ZIP" button to get a file containing `_worker.js` (with your Token and Password already embedded), then drop that same ZIP file onto the "Drag and drop your files" screen and click Deploy site. Note that the file inside the ZIP must be named exactly `_worker.js` at the root of the archive for Cloudflare Pages to run it as a full Worker, rather than serving it as a plain static JavaScript file.

4. Copy the address Cloudflare shows after deploying (something like `myworker.username.workers.dev` for a Worker, or `myproject.pages.dev` for Pages).

At any step, you can use the "📤 Export Settings" button to download a backup file of all settings entered on the page (Token, Password, selected protocols, Worker/Pages address, IPs, ports, Fingerprint, WebSocket Path, Fragment settings, advanced JSON settings, ECH, DNS, routing rules, Observatory Settings, Chain Proxy, and the config name). Use the "📥 Import Settings" button to load that same file back into the page so all settings are restored automatically.

This button only accepts a file that was exported from this exact same version of TCB. Settings files from older versions (even if manually edited) are always rejected, so an incomplete or version-mismatched set of settings can never be applied to the page by mistake. If you kept a settings file from an older version of TCB, you'll need to re-enter your settings manually in this version once, then export a fresh file so it can be imported going forward.

### Step 3 — Build the Config

1. Enter the Worker or Pages address in the corresponding field.

2. Select the desired protocol(s) — VLESS, Trojan, or both.

3. Enter clean Cloudflare IPs in the corresponding box. Besides IPs, you can also use certain domains (e.g. chatgpt.com). To find clean IPs, you can use the [Clean IP Scanner](https://github.com/4n0nymou3/Clean-IP-Scanner) tool.

4. Select the desired TLS and WebSocket ports.

5. Choose the TLS Fingerprint and the WebSocket Path.

6. If you'd like, enable Fragment settings and enter your custom values.

7. If you'd like, change the advanced JSON settings based on your needs.

8. Select the desired countries for direct routing and the desired categories for blocking; if you'd like, also adjust the Observatory Settings.

9. If you want a fixed outbound IP, enter your external server's config in the Chain Proxy box.

10. Click Generate Config.

### Step 4 — Use the Configs

- Import the generated configs (`vless://` and `trojan://` links) into v2rayNG or similar clients.
- Import the Xray JSON output config into Xray-compatible clients like v2rayNG to take advantage of least-ping mode.
- Import the Sing-box JSON output config directly into clients like Sing-box, Hiddify, or NekoBox.
- Import the Clash output config (downloaded with a `.yaml` extension) into Clash Meta / Mihomo clients like Clash Verge.

When you're done, especially if you're using a public or shared computer, be sure to click the "🔄 Clear All & Start Over" button so all your information is fully and securely wiped (full details in the [Clear All & Security](#clear-all--security) section).

## Settings Guide

### Protocols — VLESS and Trojan

This tool supports both the VLESS and Trojan protocols on a single Worker or Pages project. The Token (UUID) is used for VLESS authentication and the Password for Trojan authentication; the two operate completely independently, and changing either one in the Worker/Pages code only disables that specific protocol (exactly like how the Token behaved in earlier versions). The "Output Protocols" checkboxes in Step 3 determine which protocol(s) get configs (link, JSON, Sing-box, and Clash) built for you; the Worker/Pages code always supports both protocols, and toggling these checkboxes doesn't require redeploying the Worker/Pages project.

### TLS Fingerprint

This setting determines which browser or device your client presents itself as during the TLS handshake. DPI systems can detect proxy traffic by examining the TLS pattern; choosing a common Fingerprint like chrome or firefox makes this detection harder. Available options:

`chrome` — `firefox` — `safari` — `ios` — `android` — `edge` — `360` — `qq` — `random` — `randomized`

### WebSocket Path

The WebSocket path used in the configs. Available options: `/vless`, `/proxy`, `/v2ray`, `/ws`, `/`

### Non-TLS Ports and the Cloudflare Pages Limitation

Non-TLS configs (plain WebSocket ports) only work if you've deployed the code to a **Cloudflare Worker**. If you've deployed to **Cloudflare Pages**, these configs will never work, under any circumstances.

This is a permanent, official limitation on Cloudflare's side — not a TCB bug, and not something fixable by changing the Worker/Pages code: Cloudflare Pages always and automatically redirects every HTTP (non-TLS) request to HTTPS — this redirect happens at Cloudflare's own network layer, before the request ever reaches your code. Per Cloudflare's own team, this behavior is intentional and isn't going to change. For this reason, TCB automatically disables the non-TLS ports section whenever you select the **Pages** tab in the panel.

Based on documentation from similar projects, the same limitation also applies to a **Worker with a Custom Domain attached** — meaning even on a Worker (not Pages), if you've connected a custom domain to it, configs built for that specific custom domain can never use non-TLS ports. For this reason, when you use TCB's custom domain feature (full details in the [Connect a Custom Domain to the Worker](#connect-a-custom-domain-to-the-worker) section below), the configs built with that domain are always and automatically generated as TLS-only — without restricting the non-TLS ports for your main `workers.dev` address, since that address still fully supports non-TLS ports.

If you only need a non-TLS config (for example, for networks where TLS itself is blocked) and don't intend to use a custom domain, the **Worker** deployment method with the default `*.workers.dev` address is entirely sufficient on its own.

### Connect a Custom Domain to the Worker

If you have a personal domain (for example, an `.ir` domain or any other TLD) and want to use it **in addition to** the default `workers.dev` address to reach your Worker, that's entirely possible — and it's a free, official Cloudflare feature, not something that requires extra setup in TCB. The Worker code TCB generates for you works with a custom domain with no changes at all.

**Why doesn't TCB have a one-click "auto-connect domain" button like some similar panels?**
Some similar panels (which run as a persistent application on Cloudflare with a KV database) have a Custom Domain field in their settings that connects your domain for you with a single click. That capability is only possible because those panels first collect a **Cloudflare API Token** with access to your account and make the change directly through the Cloudflare API on your behalf. TCB is deliberately, from the ground up, a fully static and offline tool that never collects any token, API secret, or Cloudflare account information from you, and never makes any network call to any server other than the one you're deploying to yourself; collecting such a token from you would directly violate the exact principle of offline simplicity and security TCB is known for. Fortunately, connecting a custom domain doesn't require any token or API at all — it's done entirely through Cloudflare's own official dashboard, in a few simple clicks.

**Steps to connect a domain (current Cloudflare dashboard method):**

1. Add your domain to Cloudflare: sign in to your Cloudflare account, choose the option to add a domain from the homepage, and enter your domain (e.g. `example.ir`) without `https://` and without `www`.

2. Cloudflare will show you two Nameservers. Go to the panel of the company you bought the domain from (the registrar) and, in the domain's settings, replace the current Nameservers with these two.

3. Wait for the domain's status in Cloudflare to become `Active` (usually takes anywhere from a few minutes to a few hours).

4. Go to `Workers & Pages` and click on your Worker.

5. From `Settings` ← `Domains & Routes` ← `Add` ← `Custom Domain`, enter and add a subdomain of your choice (e.g. `vpn.example.ir` — not the bare `example.ir`).

Cloudflare automatically creates the necessary DNS record and a valid TLS certificate for you — no manual DNS record setup or separate certificate issuance is needed.

6. In the TCB panel, in Step 2, right below the main Worker/Pages address box, there's a checkbox labeled "I've also connected a custom domain to the Worker." Enabling it reveals a new text field; enter that same subdomain (e.g. `vpn.example.ir`) there.

**Important note:** These two addresses aren't alternatives to each other — they're combined. The top box (your main Worker/Pages address) stays untouched and builds configs exactly as before; the second box only adds extra configs using your custom domain. The JSON and YAML configs (Xray, Sing-box, Clash) build both sets into one combined file, marked with the 🌐 emoji; the single link-format configs are built separately for both addresses, side by side, with a `-D` suffix on the custom-domain versions. Since a custom domain doesn't support non-TLS ports, its configs are always built as TLS-only — so at least one TLS port must be selected in the "Ports & Fingerprint" section, or the panel will warn you when generating configs.

### Fallback Domain

In Step 2, below the Worker/Pages address box, there's an optional field labeled "Fallback Domain." If someone opens your Worker/Pages address directly, without a proxy app, they see a blank response by default — which can be a signal that this address is something special. By filling in this box with the address of a real, harmless website (e.g. a news site), that visitor sees the content of that site instead of the blank response.

**⚠️ Important note:** Unlike most other settings, which only apply on the client side, this value is embedded directly inside the Worker/Pages code. This means every time you change or clear this box, you need to fetch the Worker/Pages code again from the panel (copy or download) and replace it on Cloudflare, or the change won't take effect.

### Fragment

Enabling Fragment splits the TLS handshake data into smaller pieces, making it harder for DPI to detect. This setting fully and precisely applies to the JSON config dedicated to the Xray core; it also applies to the Sing-box JSON config, but only as a simple on/off flag (without precise control over piece length or timing, since Sing-box doesn't offer that level of control). The Clash/Mihomo format and the single-link URL configs (`vless://`, `trojan://`) don't support Fragment at all, and this setting has no effect on them. Fragment and ECH cannot be enabled at the same time.

Fragment settings:
- **Fragment Packets**: the type of data that gets fragmented. The value `tlshello` is recommended for fragmenting the TLS Client Hello.
- **Fragment Interval**: the time interval between sending fragments (milliseconds).
- **Fragment Length**: the size of each fragment (bytes).
- **Fragment Max Split**: the maximum number of times a packet is split.

In the Fragment Interval and Fragment Length fields, instead of a simple range (e.g. `10-20`), you can enter several comma-separated sequential values (e.g. `5,94,1`) so each cut has a different size or delay; the last value entered keeps repeating for any further cuts.

#### Advanced Finalmask Settings (optional — Xray core JSON only)

This section is a sub-part of the Fragment settings, designed for users facing severe upload restrictions on mobile or fixed networks. These settings only apply to the Xray core JSON config and have no effect on the Sing-box or Clash configs.

- **Enable a second Fragment stage (two-layer)**: when enabled, the output of the first Fragment stage is split once more (equivalent to adding a second fragment object to the `finalmask.tcp` array). The Stage 2 Packets, Stage 2 Interval, Stage 2 Length, and Stage 2 Max Split fields work exactly like the first stage's fields and support the same comma-separated sequential-values syntax.
- **Use the unsafe fingerprint instead of the selected one**: when enabled, instead of mimicking a specific browser's fingerprint (e.g. Chrome or Firefox), the Xray core builds a raw ClientHello packet with a fixed, predictable length. This option only affects the Xray core JSON output; the link format, Sing-box, and Clash still use the same fingerprint you selected in the "Ports & Fingerprint" section.
- **Custom Cipher Suites**: optionally enter a custom list of cipher suites. This value is also only added to the Xray core JSON, and if the field is left empty, no extra field is added to the output at all.

The point of combining these three options is to keep the real length of the ClientHello packet fixed and predictable, so the Fragment split points (in both the first and second stage) always land accurately — which is what improves upload speed on severely-restricted networks.

### ECH — Encrypted Client Hello

ECH is an additional encryption layer over the TLS handshake that hides the destination domain name (SNI) from DPI systems. When you enable ECH, your Worker or Pages domain's encryption key is fetched automatically from the DNS server, and the Client Hello is encrypted before being sent.

Simply enabling the checkbox is enough. The default address in the DNS box (Cloudflare DoH) is suitable for most users. If you have your own DoH Proxy, replace it with that address for greater reliability. ECH applies to all four output formats (VLESS/Trojan link, Xray JSON, Sing-box JSON, and Clash JSON), only in Normal mode (without Fragment), since Fragment and ECH cannot be enabled at the same time.

### Advanced JSON Settings

- **Fake DNS**: fake DNS to improve resolve speed on the client.
- **IPv6**: enable or disable IPv6 support.
- **Allow LAN**: lets other devices on the local network use the proxy.
- **TCP Fast Open**: improves connection speed by reducing handshake latency.
- **Local DNS**: the DNS server used to resolve domestic domains of the selected countries (default: 8.8.8.8).
- **Remote DNS / DoH**: the DNS server for traffic outside the selected countries (default: Cloudflare DoH). You can use the [DoH Proxy](https://github.com/4n0nymou3/cloudflare-doh-proxy) tool to build your own dedicated DoH server on Cloudflare.

### Routing Rules

This section contains two groups of checkboxes that are applied consistently across all three output formats (Xray, Sing-box, Clash):

- **Bypass rules — Iran, China, Russia**: determines which country/countries' traffic and DNS are routed directly, without going through the proxy. At least one country must be enabled; by default only Iran is selected. For greater accuracy and to prevent DNS poisoning, detecting each country's domestic domains in the Xray config is accompanied by an extra DNS verification layer (expectIPs).
- **Block rules — Ads, Porn, QUIC, Malware, Phishing, Cryptominers**: determines which categories are blocked. QUIC means blocking UDP traffic (including HTTP/3) so the browser automatically switches to regular HTTPS that passes through the tunnel. By default, only QUIC is enabled; the other categories (Ads, Porn, Malware, Phishing, Cryptominers) need to be enabled manually if you need them.

Enabling any of the Malware, Phishing, or Cryptominers checkboxes shows a warning message. Unlike Ads and Porn, these three categories don't exist at all in the default ("Official") geo dataset that many clients (like v2rayNG) ship with — they're only defined in supplementary datasets such as Chocolate4U or Loyalsoldier. If your client's Geo Assets aren't set to and downloaded from one of these supplementary datasets, enabling these three checkboxes can prevent the config from connecting at all (especially in the Xray core JSON config, since unlike Sing-box and Clash, that core has no way to auto-fetch these files from a URL specified within the config itself). To fix this, in your client's settings (e.g. in v2rayNG, under Settings → Geo Assets Provider) select Chocolate4U/Iran-v2ray-rules or Loyalsoldier and download/update the files.

For each country and each category, the GeoIP/GeoSite databases specific to that output format are used.

### Bypass Sanctions

Independent of the Bypass rules above (the "Routing Rules" section further up), this section lets you route services that block Iranian IPs because of sanctions (not local filtering) directly, using a dedicated DNS: OpenAI, Google AIs, Anthropic, xAI, Microsoft, Oracle, Docker, Adobe, Epic Games, Intel, AMD, Nvidia, Asus, HP, and Lenovo. The anti-sanction DNS box above these checkboxes defaults to 178.22.122.100 (Shecan) and can be changed to any DNS you prefer. This feature is entirely client-side and has no effect on the Worker/Pages code.

Right below these checkboxes, a separate text box called "Custom Anti-Sanction Domains" is also available — for specific sanctioned domains or services not covered by the 15 categories above. Domains entered here are, unlike the "Custom Bypass Rules" box further down, both routed directly and resolved using the same anti-sanction DNS above. Note: this box only accepts domains (not IPs or CIDRs), since DNS only resolves domains and has no meaning for a raw IP — use the boxes below for IP/CIDR.

### Custom Routing Rules

Two independent text boxes ("Custom Bypass Rules" and "Custom Block Rules") let you enter your own domain, IP, or CIDR — one per line — that aren't covered by the built-in checkboxes above. An entered domain also covers all of its subdomains. Note: these two boxes only decide the connection path (direct vs. tunneled) and do not apply the anti-sanction DNS to them — for that, use the "Custom Anti-Sanction Domains" box in the Bypass Sanctions section above. These boxes are entirely client-side, with no effect on the Worker/Pages code.

### Observatory Settings

This section controls how the Xray core tests and selects the best server, and mirrors the Observatory Settings screen of the v2rayNG client exactly:

- **leastPing Interval**: the interval between simple ping tests used to pick the fastest server. Default is `3m` (3 minutes).
- **leastLoad Interval**: the interval between rounds of the more advanced leastLoad test. Default is `5m` (5 minutes).
- **leastLoad Mode**: the HTTP method used for the test request — `HEAD` or `GET`. Default is `HEAD`.
- **leastLoad Sampling**: the number of samples taken per leastLoad test round. Default is `2`.
- **leastLoad Timeout**: the maximum time to wait for each test request. Default is `30s` (30 seconds).

Time values (leastPing Interval, leastLoad Interval, leastLoad Timeout) must be entered with an `m` (minutes) or `s` (seconds) suffix — e.g. `3m` or `30s` — and leastLoad Sampling must be a positive integer; the panel automatically prevents invalid values from being entered in these fields. These settings apply only to the Xray-core JSON config (as `observatory` and `burstObservatory` blocks) and have no effect on the Sing-box or Clash configs.

> Technical note: since the Xray core has fully removed the `allowInsecure` TLS option, it has been removed from every Xray-core JSON config generated by TCB (including Chain Proxy configs) to stay fully compatible with the latest Xray core releases and clients built on it (such as v2rayNG).

### Chain Proxy — Fixing the Outbound IP

By entering a URL-format config from an external server (e.g. a VPS with a fixed IP) into the Chain Proxy box, TCB configs get chained to that server: you connect first through your Worker or Pages project (to bypass filtering) and then through that server to the internet — meaning the outbound IP is always fixed and equal to that server's IP.

Formats supported in this box: VLESS (tcp/ws/grpc networks with none/tls/reality security), Trojan (tcp/ws/grpc with tls), Shadowsocks, SOCKS5, and HTTP.

Important notes:
- This feature only applies to JSON configs for Xray, Sing-box, and Clash, not single link-format configs, since chaining requires two coordinated nodes that can only be defined in a complete config file.
- When this feature is enabled, a ⛓️ emoji is added next to the JSON config names so it's clear which configs are chained.
- The config you enter in this box must not belong to another Cloudflare Worker or Pages project, since neither has a dedicated fixed IP; be sure to use a config from a real server (like a VPS) with its own dedicated IP.
- SOCKS5 and HTTP configs must include a username and password (e.g. `socks://user:pass@host:port`); the Xray core requires both for these two protocols, and the Chain config won't work without them. TCB checks for this at config-generation time and shows a clear error if they're missing.
- To disable this feature, leave the Chain Proxy box empty.

### Telegram WEB Proxy

Besides VLESS and Trojan, TCB can build a Telegram WEB proxy. It runs on the same Worker (or on Pages with a companion Worker) and uses a Durable Object; no VPS or external server is needed. Telegram traffic stays encrypted with Telegram's own encryption; the Worker only forwards encrypted bytes.

**Building the package in the panel**

1. In Step 2 (code generation), enter the Worker or Pages address, the Token and the Password.

2. Turn on **Enable Telegram WEB Proxy**. A random Secret is generated; use "↺ New" for a fresh one, or paste or type your own Secret (32 hexadecimal characters, with or without the `dd` prefix) directly into the box; while the value is invalid the link and package download stay disabled. **Random padding** adds the `dd` prefix to the Secret. The **Hostname** field is the address from Step 2 (the custom domain if enabled) and the **Link** field is the link that adds the proxy to Telegram.

3. Click the Telegram package download button. While this option is on, the single-file copy/download buttons are hidden because the VLESS/Trojan code is inside the package (`tcb-worker.js`).

**Deploying on a Worker** (`tcb-telegram-worker.zip`)

1. Create a new private GitHub repository and upload every file in the ZIP to its root.

2. In Cloudflare: Workers & Pages → Create → Import a repository, and choose that repository. The Worker name must equal `name` in `wrangler.toml`.

3. After deployment: Worker → Settings → Variables and Secrets → Add, type **Secret**, name `TELEGRAM_SECRET`, value = the Secret shown in TCB.

4. In Telegram, add the proxy with the panel link, or enter the Hostname and Secret manually (Hostname without `https://` and without a port).

**Deploying on Pages** (two ZIP files)

With the Telegram option on and the Pages tab selected, two files are downloaded. `tcb-telegram-worker.zip` is a companion Worker that holds the Durable Object (Pages alone cannot create one) and `tcb-pages-worker.zip` contains `_worker.js`.

1. First deploy the companion Worker from `tcb-telegram-worker.zip` as above. Its project name must be exactly the name written in the `README-TELEGRAM.txt` inside the ZIP (Worker name + `-telegram`). Then add `TELEGRAM_SECRET` to it.

2. Upload `tcb-pages-worker.zip` to your Pages project as before.

3. In Pages → Settings → Bindings → Add → Service binding: variable name `TELEGRAM_WORKER`, service = the companion Worker's name. Then deploy Pages once more so the binding becomes active.

**Cloudflare variables (Runtime, not Build)**

- `TELEGRAM_SECRET` — type Secret, required. If missing, the Telegram feature stays off and VLESS/Trojan keep working unchanged.
- `TELEGRAM_HOSTNAME` — plain variable; already set in the package's `wrangler.toml` and must equal the panel's Hostname.
- `TELEGRAM_DIAG` — optional; set it to `1` only while troubleshooting and remove it afterwards. It logs a few sanitized connection-stage events, not traffic content.

**Notes**

- Do not put the Secret on GitHub; keep it only as a Cloudflare Secret. After changing the Secret or Random padding, update `TELEGRAM_SECRET` in Cloudflare and the secret in Telegram too.
- The paths `/api/v1/session` and `/api/v1/ws` and the `?bridge=` query on `/` are reserved for Telegram.
- Cloudflare free-plan limits for Workers and Durable Objects apply.

### Config Output Formats

After building the config, the result is available simultaneously in four formats:

- **VLESS link** (`vless://`) — for direct import into v2rayNG and similar clients.
- **JSON for Xray** — a complete config with least-ping mode for automatically selecting the fastest server.
- **JSON for Sing-box** — a complete config for Sing-box, Hiddify, and NekoBox, including ECH support when enabled.
- **JSON for Clash / Mihomo** — a complete config for Clash Meta and similar clients like Clash Verge, including ECH support when enabled. This file is written with a JSON structure but downloaded with a `.yaml` extension, since JSON is a valid subset of YAML. Note that the Clash/Mihomo format doesn't support Fragment.

All four formats are built from the same settings (IPs, ports, Fingerprint, Fragment, advanced JSON settings).

### Config Naming

The name of all three JSON/YAML formats (Xray, Sing-box, Clash) is determined automatically and consistently based on the config's state: `Normal` for the regular mode, `Fragment` if Fragment is enabled, or `ECH` if ECH is enabled. In the optional "Config Name" field (at the end of Step 3's settings, after Chain Proxy), you can also enter a custom name; this name is applied to the config itself (across all three formats) as well as to the downloaded file names. If Chain Proxy is enabled, the ⛓️ emoji is also appended to this name.

### Clear All & Security

The "🔄 Clear All & Start Over" button sits below the Generate Config button and, after a confirmation prompt, restores the panel to exactly the same state it's in on the very first page load: every field returns to its default value, a fresh Token and Password are generated, and the generated configs section disappears.

This button isn't just a visual reset. It also fully wipes the actual content of the generated configs (which otherwise stays behind in the page) from the page's memory, clears the system clipboard (where supported by the browser), and the sensitive fields (Token, Password, Worker/Pages address, IPs, Chain Proxy, config name) have browser Autofill disabled. On top of that, even if you forget to click this button, the same full wipe happens automatically and silently the moment you close or leave the page.

These protections are specifically designed for using this tool on public or shared computers (internet cafes, workplaces, and the like) so the next person can't extract your information from the page's background state, the clipboard, or the browser's Autofill memory. That said, for complete security, it's still recommended to clear your browser history and site data after using such systems.

## Running Offline on Your Own Device

If you want to run this tool without an internet connection, directly on your own device, follow the steps below.

### Required Tools

To run this project locally, you need two things:

- **Git** — to download the project files from GitHub
- **Python** — to run a simple local server

---

### Step 1 — Install Git (if needed)

If Git isn't installed on your system, install it first:

**Linux (Ubuntu/Debian):**

</div>

```sh
sudo apt install git
```

<div align="left" dir="ltr">

**macOS:**

</div>

```sh
brew install git
```

<div align="left" dir="ltr">

**Windows:** download and run the installer from [git-scm.com](https://git-scm.com).

**Termux on Android:**

</div>

```sh
pkg install git
```

<div align="left" dir="ltr">

**iSH on iOS:**

</div>

```sh
apk add git
```

---

<div align="left" dir="ltr">

### Step 2 — Clone the Project

The command below downloads all the project files from GitHub to your device:

</div>

```sh
git clone https://github.com/4n0nymou3/tcb.git
```

<div align="left" dir="ltr">

> **Note:** the `git clone` command means "make me a complete copy of this project." After running it, a folder named `tcb` will be created in your current path.

---

### Step 3 — Enter the Project Folder

</div>

```sh
cd tcb
```

<div align="left" dir="ltr">

> **Note:** the `cd` command means "go into this folder." You must do this step, otherwise the next steps won't work.

---

### Step 4 — Install Python (if needed)

Python is usually already installed on Linux and macOS. If it isn't:

**Linux (Ubuntu/Debian):**

</div>

```sh
sudo apt install python3
```

<div align="left" dir="ltr">

**macOS:**

</div>

```sh
brew install python3
```

<div align="left" dir="ltr">

**Windows:** download the installer from [python.org](https://python.org). Be sure to check **Add Python to PATH** during installation.

**Termux on Android:**

</div>

```sh
pkg install python
```

<div align="left" dir="ltr">

**iSH on iOS:**

</div>

```sh
apk add python3
```

---

<div align="left" dir="ltr">

### Step 5 — Start a Local Server

This tool is a web page and needs a server to run correctly. Python will build this simple server for you.

Depending on the Python version installed on your system, run one of the commands below:

**Python 3 (Linux, macOS, Windows, Termux):**

</div>

```sh
python -m http.server 8080
```

<div align="left" dir="ltr">

**Python 3 on iSH:**

</div>

```sh
python3 -m http.server 8080
```

<div align="left" dir="ltr">

**Python 2 (older version):**

</div>

```sh
python -m SimpleHTTPServer 8080
```

<div align="left" dir="ltr">

> **Note:** `8080` is the port number. If that port is already in use, you can substitute another number like `8000` or `9090`.

When the server starts successfully, you'll see something like this:

</div>

```
Serving HTTP on 0.0.0.0 port 8080 ...
```

---

<div align="left" dir="ltr">

### Step 6 — Open the Tool in Your Browser

Open your browser and enter the address below:

</div>

```
http://localhost:8080
```

<div align="left" dir="ltr">

---

### Stopping the Server

When you're done, simply press the following keys in the same terminal window to shut down the server:

</div>

```
Ctrl + C
```

<div align="left" dir="ltr">

#### If You Accidentally Closed the Terminal

Sometimes you close the terminal window, but the server keeps running in the background and holds onto port 8080. In that case, the next time you try to start the server you'll get an error.

To fix this, run the two commands below in order:

**First — find the program occupying port 8080:**

</div>

```sh
lsof -i :8080
```

<div align="left" dir="ltr">

This command shows a table. In the `PID` column you'll see a number — that number is the ID of the program that needs to be closed.

**Second — close that program using its ID:**

</div>

```sh
kill -9 PID
```

<div align="left" dir="ltr">

Replace `PID` with the actual number from the previous command's output. For example, if the number was `2341`:

</div>

```sh
kill -9 2341
```

---

<div align="left" dir="ltr">

## Related Tools

- [Clean IP Scanner](https://github.com/4n0nymou3/Clean-IP-Scanner) — find clean Cloudflare IPs with Termux on Android
- [DoH Proxy](https://github.com/4n0nymou3/cloudflare-doh-proxy) — build your own dedicated DNS over HTTPS server on Cloudflare

## License

This project is released under the [MIT License](LICENSE) — free to use. The fonts embedded in `css/fonts.css`, JetBrains Mono and Vazirmatn, remain under their own SIL OFL 1.1 license ([JetBrains Mono](https://github.com/JetBrains/JetBrainsMono), [Vazirmatn](https://github.com/rastikerdar/vazirmatn)).

---

## Author

Designed and developed by: **Anonymous**

Contact: [Telegram](https://t.me/An0nymou3Bot)

---

## Support the Project

If this tool was useful to you:

- ⭐ Give the repository a Star
- Share it with your friends

</div>