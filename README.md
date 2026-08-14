# BronUz — O'zbekiston Salon Booking Platformasi

O'zbekiston salonlari uchun onlayn navbat tizimi. Telegram bot, Payme & Click to'lov, SMS eslatmalar.

## Tezkor ishga tushirish

```bash
git clone https://github.com/fazliddin2005/BronUz.git
cd BronUz
npm install
cp .env.example .env
# .env faylni to'ldiring
npm start
```

## Loyiha strukturasi

```
bronuz/
├── server.js          # Asosiy server
├── config/            # Database
├── models/            # User, Booking
├── routes/            # auth, salon, admin
├── middleware/        # JWT himoya
├── utils/             # Token yaratish
└── public/            # Frontend
```

## Xavfsizlik

- bcrypt(12) — parollar hashlanadi
- JWT — access (15 min) + refresh (7 kun)
- Rate limiting — 5 urinishdan keyin blok
