# Antrenman Defteri — CLAUDE.md

Kişiye özel antrenman ve beslenme takip uygulaması. Ali (ürün sahibi) müşterilerine programı hazırlıyor, müşteri kendi linkinden uygulamayı kullanıyor. UI tamamen **Türkçe**, kullanıcıların çoğu **telefondan** giriyor.

## Mimari
- **Tek dosya statik web uygulaması:** `index.html` (HTML + CSS + JS bir arada). Build adımı, framework veya npm bağımlılığı yok. Bu yapıyı koru.
- **Yayın:** GitHub Pages, `main` dalının kökü. Adres: `https://aliergin07.github.io/antrenman-defteri/?k=<token>`
- Diğer dosyalar: `manifest.json` (PWA), `icon-192.png`, `icon-512.png`.
- **Veri:** Supabase Postgres (proje `arzvltufqjyxacghknbz`). Erişim sadece token kontrollü `SECURITY DEFINER` RPC'lerle, REST üzerinden yapılıyor: `POST /rest/v1/rpc/<fn>`, header `apikey: <publishable key>`. Publishable key'in `index.html` içinde olması normal.
- **Kimlik:** URL'deki `?k=<uuid>` token'ı. `localStorage['pt_k']` içinde saklanıyor. Login yok.

## Veritabanı
- `pt_clients`:
  - id, token (uuid, unique), label
  - profil jsonb, program jsonb, targets jsonb (default `{}`), settings jsonb (**NOT NULL**, boş için `{}`)
  - active, created_at, updated_at
- `pt_logs`: (client_id, day date) primary key, data jsonb
- `pt_exercises` (id, data): hareket kütüphanesi. Sadece koç kullanır, istemci okumaz.
- `pt_templates` (id, data): program şablonları, ör. `fullbody_3g_baslangic`.
- RLS açık, policy yok. Tablolara anon/authenticated erişimi kapalı.
- RPC'ler:

| RPC | Ne yapar | Limit |
|---|---|---|
| `pt_get(p_token)` | profil, program, targets, settings ve son 200 log'u (tarih → data) döner | |
| `pt_save_profil(p_token, p_profil)` | profili kaydeder | 20 KB |
| `pt_save_settings(p_token, p_settings)` | ayarları kaydeder | 5 KB |
| `pt_save_log(p_token, p_day, p_data)` | o günün log'unu kaydeder | 60 KB |

- **Şema veya RPC değişikliği gerekiyorsa koda gömme.** Önce Ali'ye yazılı olarak öner, migration ayrıca uygulanır. Mümkün olduğunca mevcut alanlar içinde çöz (yeni bilgi profil veya log jsonb'sine eklenebilir).
- **Müşteri token'larını repoya, commit mesajına veya koda asla yazma.** Repo public.

## Veri şekilleri (istemci tarafı)
- `S` global durum: `profil`, `program`, `targets` (= DB `targets.items`), `settings`, `logs` (tarih → log), `cur` (seçili gün), `tab`, `sess`.
- **program:**
  - `{start:'YYYY-MM-DD', weeks, deload, rules:[], rehber, blocks:{key:{t, items:[...]}}, days:{'0'..'6':{title, note, sessions:{sabah:[blockKey], aksam:[blockKey]}}}, dates:{'YYYY-MM-DD': gün override}, targets:{kcal, p}}`
  - Hareket (item): `{id, n, s, r, q, note, w:false?, leg?, knee?, fw?, dow?, alt?}`
    - `s`: set sayısı ya da hafta adımlı dizi, ör. `[[1,2],[2,3]]` (1. haftadan itibaren 2 set, 2. haftadan itibaren 3).
    - `r`: tekrar metni, ör. `"8–12"`.
    - `q`: YouTube arama sorgusu.
    - `w:false`: ağırlık girişi yok.
  - `pick(v, wk)` ve `setsFor(ex, wk)` haftaya göre değeri çözer.
- **log (gün):**
  - `{date, items:{'<blockKey>.<exId>':{w, reps:[], d:[bool]}}, note, pain, knee, olcum:{kilo, bel, boyun, kalca, ...}, haftalik:{...}, saglik}`
  - Kaydetme akışı: `mutate(fn)` → `queueSave` → `flushSave` (debounce).
- **targets:** `S.targets[exId] = {w, not}`. Koçun yazdığı hedef ağırlık; kartta "Hedef:" olarak görünür.
- **profil:**
  - Form alanları `PF` dizisinde: ad, yas, cinsiyet ('Erkek'/'Kadın'), boy, kilo, bel, boyun, kalca, hedef, deneyim, saglik, yer, gun, sure, ...
  - `profil.test = {done, skip, tarih, sonuc, seviye:{bacak, kalca, gogus, sirt, kol, omuz, omuzMob, karin} (1–3), agri:[], kalcaFark}`
  - `profil.testler`: test geçmişi, en fazla 6 kayıt.

## Akış (render)
- Token geçersizse "Bu link geçersiz".
- Profil yoksa `renderProfil` (form).
- Başlangıç testi yapılmamışsa ve program yoksa `renderTest`.
- Program yoksa `renderBekle`.
- Program varsa sekmeler: Antrenman (`renderDay`), Hafta, Ölçüm, Geçmiş, Profil.

## Önemli hesaplar (değiştirmeden önce Ali'ye sor)
- **Yağ oranı:** iki yöntemin aralığı gösterilir, tahmin aralığın ortasıdır (`bfRange`, `bfGauge`).
  - US Navy erkek: `495/(1.0324-0.19077*log10(bel-boyun)+0.15456*log10(boy))-450`
  - US Navy kadın: `495/(1.29579-0.35004*log10(bel+kalça-boyun)+0.22100*log10(boy))-450`
  - RFM: erkek `64-20*(boy/bel)`, kadın `76-20*(boy/bel)`
- **VKİ** kategorileri ve **bel/boy oranı** (0,5 altı sağlıklı).
- **Başlangıç testi eşikleri** `tLevel()` içinde. Ağrı işaretlenen bölge seviye 1 sayılır.
- **`autoSug`:** tüm setlerde aralığın üst tekrarına ulaşıldıysa ağırlık artırımı önerir. 20 kg altında +2 kg, üstünde +2,5 kg.

## Kod kuralları
- Vanilla JS, mevcut stile uy: küçük fonksiyonlar, template string ile HTML, kullanıcı verisini her zaman `esc()` ile kaçır.
- **Renkler sadece CSS token'larından** (`--bg, --surface, --fg, --muted, --line, --accent, --accent-soft, --on-accent, --done, --warn, --warn-soft`). Açık ve koyu tema ikisi de çalışmalı.
- 390 px genişlikte yatay kaydırma olmamalı, dokunma hedefleri en az 36 px.
- Metinler kısa, sade ve Türkçe. Hata mesajı ne olduğunu ve ne yapılacağını söylemeli.
- Mevcut kullanıcı verisini bozma: yeni alanlar opsiyonel olmalı, eski log ve profillerle çalışmalı.

## Test
- Testlerde gerçek Supabase'e bağlanma. Playwright ile `**/rest/v1/rpc/**` isteklerini route mock'la yakala ve `pt_get` yanıtını sahte veriyle ver.
- Her değişiklikten sonra:
  - Sayfa hatasız açılıyor mu (`pageerror` yok)?
  - İlgili akış uçtan uca çalışıyor mu?
  - 390 px ekran görüntüsü açık ve koyu temada düzgün mü?
- Commit mesajları Türkçe veya İngilizce, kısa. Her özellik ayrı commit.
