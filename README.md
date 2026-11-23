# Kamu Radar veri akışı

[Kamu Radar](https://github.com/mahrijemalsaparova/kamu-radar) uygulamasının okuduğu `feed.json` dosyası.

- **Kaynak:** Resmî Gazete, “Çeşitli İlânlar” bölümü (resmî ve herkese açık ilanlar; 5846 sayılı FSEK md. 31 kapsamında serbestçe kullanılabilir).
- **Güncelleme:** GitHub Actions her gün 00:40 ve 06:10'da (TSİ) son 21 günü kontrol eder; yalnızca yeni günler indirilir.
- **Filtre:** Personel alımı, öğretim elemanı, sözleşmeli personel, sürekli işçi ve giriş sınavı ilanları. Sonuç, iptal ve ihale ilanları atlanır.
- **Nezaket:** istekler sırayla ve aralıklı yapılır, User-Agent bu depoyu gösterir.

`deadlineEstimated: true` olan ilanlarda son gün metinden okunamamıştır; yönetmelikteki 15 günlük süreye göre tahmin edilmiştir.
Başvurmadan önce her zaman resmî ilan metnini (`url`) kontrol edin.

Yerelde çalıştırmak için `pdftotext` (poppler) gerekir:

```bash
node build-feed.mjs 21
```
