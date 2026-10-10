# Soliq Nazorat — shaxsiy buxgalteriya paneli

Bu loyiha GitHub Pages’da ishlaydigan frontend va ma’lumotlarni turli qurilmalarda bir xil ko‘rsatish uchun Supabase bazasidan foydalanadi. Saytning 4 ta bo‘limi bor:

1. **Dashboard** — tashkilotlar soni, topshirilgan/kutilayotgan/muddati o‘tgan hisobotlar.
2. **Tashkilotlar** — nom, INN/STIR, direktor, telefon, hisobot turlari va PFX faylini yuklash/yuklab olish.
3. **Hisobotlar nazorati** — hisobot topshirilganda o‘zingiz belgi qo‘yasiz; topshirilgan sana avtomatik yoziladi.
4. **Moliyaviy holat** — oylik xizmat haqi, qisman/to‘liq to‘lovlar, to‘lov tarixi va yig‘ilgan qarz.

## 1. Supabase loyihasini yaratish

1. [supabase.com](https://supabase.com/) saytida hisob oching va **New project** yarating.
2. Loyihaning **SQL Editor** bo‘limiga kiring.
3. Ushbu papkadagi `supabase-schema.sql` faylini ochib, ichidagi butun SQL matnini SQL Editor’ga joylashtiring va **Run** tugmasini bosing.
4. SQL bajarilgach, `organizations`, `organization_reports`, `report_statuses`, `monthly_finances`, `payments` jadvallari hamda shaxsiy PFX uchun yopiq `pfx-keys` fayl ombori yaratiladi.

## 2. Saytga kirish uchun yagona foydalanuvchi yaratish

1. Supabase’da **Authentication → Users** bo‘limini oching.
2. **Add user** orqali o‘zingiz foydalanadigan email va parol bilan bitta foydalanuvchi yarating.
3. Saytda ro‘yxatdan o‘tish formasi yo‘q; shu email/parol bilan kirasiz.
4. Agar Supabase sozlamalarida public sign-up yoqilgan bo‘lsa, uni o‘chirib qo‘yishingiz mumkin. Foydalanuvchini Supabase panelidan qo‘lda qo‘shish baribir mumkin.

## 3. `config.js` faylini sozlash

Supabase’da **Project Settings → API** yoki **Connect** sahifasidan quyidagi ikkita qiymatni oling:

- Project URL
- Publishable key (yoki eski loyihalarda anon/public key)

`config.js` faylini ochib, qiymatlarni joylashtiring:

```js
window.APP_CONFIG = {
  SUPABASE_URL: "https://YOUR-PROJECT.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_..."
};
```

**Muhim:** `service_role`, secret key yoki ma’lumotlar bazasining parolini `config.js` ichiga hech qachon yozmang. Frontend uchun faqat publishable/anon key ishlatiladi; ma’lumotlarga ruxsat SQL’dagi RLS siyosatlari orqali cheklanadi.

## 4. GitHub Pages’ga joylash

1. GitHub’da yangi repository yarating.
2. Ushbu papkadagi barcha fayllarni repository’ning ildiziga yuklang: `index.html`, `styles.css`, `app.js`, `config.js`, `supabase-schema.sql`, `README.md`.
3. Repository → **Settings → Pages** bo‘limiga kiring.
4. **Deploy from a branch** tanlang, `main` branch va `/ (root)` ni belgilang, saqlang.
5. GitHub Pages bergan manzilni oching. Supabase’da Authentication URL configuration bo‘limida **Site URL** sifatida shu manzilni kiriting.
6. Sayt ochilganda email va parol bilan kiring.

## 5. Birinchi marta ishlatish

1. **Tashkilotlar → Tashkilot qo‘shish** orqali tashkilot ma’lumotlarini kiriting.
2. Oylik xizmat haqini va moliyaviy hisob boshlanadigan oyni belgilang.
3. Tashkilot topshiradigan hisobot turlarini tanlang. Boshqa turlarni vergul bilan yozib qo‘shish mumkin.
4. Tashkilot qatoridagi **PFX yuklash** tugmasi bilan `.pfx` yoki `.p12` faylini biriktiring.
5. Boshqa kompyuterda saytga kiring va **Yuklab olish** tugmasi orqali shu faylni qurilmaga saqlang.
6. **Hisobotlar nazorati** bo‘limida hisobot topshirilgach, katakchaga belgi qo‘ying. Tizim sanani saqlaydi.
7. **Moliyaviy holat** bo‘limida to‘lov kelganida summani kiriting. Qisman to‘lovlar ham qo‘llab-quvvatlanadi.

## Hisoblash qoidalari va eslatmalar

- Hisobotlarning dastlabki muddati 15-sana. `Hisobotlar nazorati` sahifasidagi sana maydonidan muddatni o‘zgartirsangiz, shu hisobot uchun keyingi davrlarda ham kun raqami standart bo‘ladi. Soliq turi bo‘yicha haqiqiy muddatlarni o‘zingiz tekshirib belgilang.
- Moliyaviy majburiyatlar tashkilot profilidagi **hisob-kitob boshlanish oyi**dan boshlab yaratiladi. Birinchi marta ochganda, tashkilotning avvalgi oylardan qolgan qarzi bo‘lsa, boshlanish oyini va oylik summani to‘g‘ri belgilang.
- Avtomatik ravishda `monthly_fee` qiymati har oy uchun yozuvga qo‘yiladi. Agar xizmat haqi tarix davomida o‘zgargan bo‘lsa, eski oylar summasini alohida tekshirish talab qilinadi.
- PFX fayli yopiq Supabase Storage omboriga yuklanadi. Sayt faylni yuklab beradi, lekin E-IMZO dasturini o‘rnatish yoki `my.soliq.uz` ichida kalitni tanlash jarayonini o‘zi bajarmaydi.
- PFX paroli bazada saqlanmaydi. Kalit faylini saytga yuklashdan avval uning to‘g‘ri tashkilotga tegishli ekanini tekshiring.
- Bu boshlang‘ich versiya. Ishga tushirgandan keyin avval 1–2 ta sinov tashkilotida login, hisobot belgisi, to‘lov va PFX yuklashni tekshiring; keyin haqiqiy ma’lumotlarni kiriting.
