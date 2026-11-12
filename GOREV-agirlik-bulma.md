# Görev: Ağırlık bulma haftası

## Amaç
Yeni başlayan kullanıcı her ağırlıklı harekette hangi kiloyla çalışacağını bilmiyor. Maksimal (1RM) test yaptırmak bu kişiler için güvenli değil. Bunun yerine **ilk hafta**, her harekette birkaç deneme setiyle **çalışma ağırlığı** bulunacak. Bu ağırlıktan **tahmini maksimal (e1RM)** hesaplanacak ve sonraki haftalarda hedef ağırlık olarak gösterilecek.

Onaylı tasarım: `agirlik_bulma_tasarim.png` (4 adım: deneme seti → uygulamanın cevabı → 2. haftadan itibaren kart → ay sonu gelişim).

## Ne zaman aktif
- `program.kalibrasyon` alanı hangi haftaların ağırlık bulma haftası olduğunu belirtir, ör. `{"hafta":[1]}`.
- Bu haftada ağırlıklı her harekette (yani `w !== false` olanlarda) ağırlık bulma modu açılır.
- O hareket için daha önce sonuç kaydedilmişse mod açılmaz, normal kart gösterilir. Kullanıcı aynı hareketi haftada iki kez görebilir.
- Alan yoksa davranış aynen eskisi gibi kalır.

## Program tarafında yeni opsiyonel alanlar (hareket item'ı)
- `w0`: önerilen başlangıç ağırlığı (kg). Koç seviyeye göre yazar.
- `inc`: ağırlık kademesi (kg). Varsayılanlar:
  - Dambıl: 10 kg altında 1, 10 kg ve üstünde 2.
  - Makine/kablo: 2,5.
  - Uygulama `inc` yoksa 2 kullanır.

## Kart akışı (ağırlık bulma modunda)
1. **Bölüm başı bilgilendirme:** Günün en üstünde bir kez "1. hafta: ağırlık bulma haftası" kutusu gösterilir (tasarımdaki metin).
2. **Karttaki etiket ve hedef:**
   - Kartta "ağırlık bulma" etiketi görünür.
   - Hedef tekrar `T`, tekrar aralığının ortasıdır. Örnekler: `8–12` → 10, `10–12` → 11, `8–10/taraf` → 9. Tek sayıysa o sayı.
3. **Isınma satırı:** "çok hafif × 10 tekrar" ve bir ✓ düğmesi. `w0` varsa ısınma önerisi `w0`'ın yarısıdır.
4. **Deneme satırı:**
   - kg kutusu (`w0` ile ön dolu) ve tekrar kutusu (`T` ile ön dolu).
   - Altında **"Kaç tekrar daha yapabilirdin?"** sorusu ve `0 · 1 · 2 · 3 · 4+` düğmeleri.
5. **Değerlendirme:** Seçim yapılınca deneme kaydedilir ve değerlendirilir (aşağıdaki algoritma).
   - **RIR 2–3** → bitti. Yeşil sonuç kutusu gösterilir: "Çalışma ağırlığın: X kg × T". Altında küçük yazıyla "Tahmini maksimal: ~Y kg".
   - **RIR 4+ veya 0–1** → yeni bir deneme satırı açılır, kg kutusu önerilen yeni ağırlıkla dolu gelir, yanında "hafif ↑" veya "ağır ↓" yazar.
   - **En fazla 3 deneme.** 3. denemeden sonra en iyi tahminle bitirilir.
6. **Kalan setler:** Sonuç kutusundan sonra kalan setler (`setsFor` − 1) normal set düğmeleri olarak, bulunan ağırlıkla gösterilir.

## Algoritma
- RIR = "kaç tekrar daha". `4+` hesapta 5 kabul edilir (üst sınırı belirsiz).
- **e1RM (Epley):** `e1rm = w × (1 + (reps + RIR) / 30)`
- **Hedef ağırlık (RIR 2 ile T tekrar):** `wT = e1rm / (1 + (T + 2) / 30)`
- **Yuvarlama:**
  - Bitişte aşağı yuvarlanır: `floor(wT / inc) × inc`.
  - Ara önerilerde en yakın kademeye yuvarlanır.
  - Sonuç en az 1 kademe olmalı.
- **Ara öneri sınırları:**
  - RIR ≥ 4 ise yeni öneri en az `w + inc` olur.
  - RIR ≤ 1 ise yeni öneri en fazla `w − inc` olur.
- Örnek (T=10, dambıl):
  - 10 kg × 10, "4+" → e1rm = 10 × 1,5 = 15 → wT = 15 / 1,4 ≈ 10,7. Ama RIR ≥ 4 kuralı gereği en az 10 + 2 → **öneri 12 kg**.
  - 12 kg × 10, RIR 2 → e1rm = 12 × 1,4 = 16,8 → wT = 12 → **sonuç 12 kg**, tahmini maksimal ~17 kg.

## Veri
- Deneme setleri o günün log'una, hareketin item'ı altında saklanır:
  `items['<blockKey>.<exId>'].cal = {tries:[{w, reps, rir}], done:true, w, e1rm, T}`
- **Hedef ağırlığın kaynağı (öncelik sırasıyla):**
  1. Koçun `S.targets[exId].w` değeri.
  2. Yoksa, bu hareketin en son tamamlanmış `cal` sonucu (`w`). Logları tarihe göre geriye tarayarak bulunur, `lastWeight()` mantığına benzer şekilde.
- Kartta gösterim: "Hedef: X kg". Mevcut "Geçen:" ve `autoSug` önerisi aynen kalır.
- **Şema değişikliği gerekmez.** Her şey mevcut log jsonb'si içinde. 60 KB limitine dikkat et, denemeler küçük kalmalı.

## Profil: "Güç gelişimin" bölümü
- Profil sekmesinde, test özetinin altında listelenir.
- Her hareket için ilk `cal.e1rm` ile en son tahmini maksimal karşılaştırılır.
- Son tahmin, son 14 günün log'larında en yüksek `w × (1 + reps/30)` değeridir (normal setlerden, RIR bilinmediği için 0 kabul edilir).
- Format: `Goblet squat  tahmini maks 19 → 27 kg  +%42`
- En az 1 hafta veri yoksa bölüm gösterilmez.

## Kapsam dışı
- Gerçek 1RM testi.
- Ağırlıksız hareketler (plank, şınav vb.).
- Diz modu açıkken `leg` hareketleri. Bunlar bugünkü gibi kapalı kalır.

## Kabul kriterleri
1. `program.kalibrasyon` yoksa uygulama birebir eskisi gibi davranır (regresyon yok).
2. 1. haftada ağırlıklı bir hareket kartında etiket, ısınma, deneme ve RIR düğmeleri görünür. Ağırlıksız hareketlerde görünmez.
3. **Örnek akış:**
   - 10 kg × 10 + "4+" → 12 kg önerilen 2. deneme açılır ve "hafif ↑" yazar.
   - 12 kg × 10 + "2" → sonuç "12 kg × 10", e1rm ≈ 16,8 kg ("~17 kg" gösterilir).
4. RIR 0 → önerilen ağırlık en fazla `w − inc` olur.
5. 3 denemeden sonra 4. deneme açılmaz, sonuç kutusu gösterilir.
6. Sayfayı yenileyince denemeler ve sonuç korunur (log'dan okunur).
7. 2. hafta aynı hareketin kartında "Hedef: X kg" yazar (koç hedefi yoksa).
8. Koç hedefi (`targets`) varsa o gösterilir.
9. Aynı hareket aynı hafta ikinci kez geldiğinde ağırlık bulma tekrar açılmaz.
10. 390 px genişlikte açık ve koyu temada taşma yok. `pageerror` yok.
11. Playwright mock testleri:
    - 3 deneme senaryosu
    - yenileme sonrası durum
    - 2. hafta hedefi
    - kalibrasyonsuz program

## Teslim
- Tek commit (ya da özellik + test commit'i). Kısa bir açıklama yaz.
- 390 px ekran görüntüleri ekle: 1. hafta kartı, sonuç kutusu, 2. hafta kartı, profil gelişim bölümü.
