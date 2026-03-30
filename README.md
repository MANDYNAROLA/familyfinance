# 💰 FamilyFinance

A real-time family finance dashboard with role-based access, family sharing, savings goals, and live updates — built with Firebase.

---

## ✨ Features

| Feature | Details |
|---|---|
| 🔐 Auth | Email/password + Google sign-in |
| 👨‍👩‍👧 Family roles | Admin, Parent, Child, Viewer |
| 💳 Transactions | Shared (family) + Private (personal) |
| 🎯 Goals | Family & personal savings goals with contributions |
| 🔔 Alerts | Real-time notifications when members add transactions |
| 📊 Dashboard | Live charts, spending breakdown, member activity |
| ⚙️ Settings | Admin can rename family, change member roles |

---


| Action | Admin | Parent | Child | Viewer |
|---|:---:|:---:|:---:|:---:|
| View family transactions | ✅ | ✅ | ✅ | ✅ |
| Add transaction | ✅ | ✅ | ✅ | ❌ |
| Delete transaction | ✅ | ✅ | ❌ | ❌ |
| Add/delete goals | ✅ | ✅ | ❌ | ❌ |
| Contribute to goal | ✅ | ✅ | ✅ | ❌ |
| Invite members | ✅ | ✅ | ❌ | ❌ |
| Change member roles | ✅ | ❌ | ❌ | ❌ |
| Change family settings | ✅ | ✅ | ❌ | ❌ |
| Private transactions | ✅ | ✅ | ✅ | ✅ |

---

## 📁 File structure

```
familyfinance/
├── index.html          ← Login / Sign up page
├── dashboard.html      ← Main app
├── css/
│   ├── auth.css        ← Login page styles
│   └── dashboard.css   ← App styles
├── js/
│   └── dashboard.js    ← All Firebase logic
└── README.md
```

---

Built with ❤️ using Firebase Realtime Database + Vanilla JS. No build tools required.
