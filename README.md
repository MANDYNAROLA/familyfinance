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

## 🚀 Setup (10 minutes)

### Step 1 — Create a Firebase project

1. Go to [https://console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project** → name it `familyfinance` → continue
3. Disable Google Analytics (optional) → **Create project**

### Step 2 — Enable Authentication

1. In Firebase console → **Authentication** → **Get started**
2. Enable **Email/Password** provider
3. Enable **Google** provider (add your project's support email)

### Step 3 — Enable Realtime Database

1. In Firebase console → **Realtime Database** → **Create database**
2. Choose **Start in test mode** (you'll secure it later)
3. Pick your region → Done

### Step 4 — Get your config

1. In Firebase console → **Project settings** (gear icon)
2. Scroll to **Your apps** → click **</>** (Web)
3. Register app as `FamilyFinance`
4. Copy the `firebaseConfig` object

### Step 5 — Paste config into the app

Open **both** of these files and replace the `firebaseConfig` placeholder:

- `index.html` (line ~80)
- `js/dashboard.js` (line ~15)

```javascript
const firebaseConfig = {
  apiKey: "YOUR_ACTUAL_KEY",
  authDomain: "your-project.firebaseapp.com",
  databaseURL: "https://your-project-default-rtdb.firebaseio.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

### Step 6 — Set database security rules

In Firebase console → **Realtime Database** → **Rules** → paste:

```json
{
  "rules": {
    "users": {
      "$uid": {
        ".read": "auth != null && (auth.uid === $uid || root.child('users').child(auth.uid).child('familyId').val() === data.child('familyId').val())",
        ".write": "auth != null && auth.uid === $uid"
      }
    },
    "families": {
      "$familyId": {
        ".read": "auth != null && root.child('users').child(auth.uid).child('familyId').val() === $familyId",
        ".write": "auth != null && root.child('users').child(auth.uid).child('familyId').val() === $familyId"
      }
    },
    "transactions": {
      "$familyId": {
        ".read": "auth != null && root.child('users').child(auth.uid).child('familyId').val() === $familyId",
        ".write": "auth != null && root.child('users').child(auth.uid).child('familyId').val() === $familyId"
      }
    },
    "goals": {
      "$familyId": {
        ".read": "auth != null && root.child('users').child(auth.uid).child('familyId').val() === $familyId",
        ".write": "auth != null && root.child('users').child(auth.uid).child('familyId').val() === $familyId"
      }
    },
    "alerts": {
      "$familyId": {
        ".read": "auth != null && root.child('users').child(auth.uid).child('familyId').val() === $familyId",
        ".write": "auth != null && root.child('users').child(auth.uid).child('familyId').val() === $familyId"
      }
    }
  }
}
```

---

## 🌐 Deploy to GitHub Pages (free hosting)

1. Create a new GitHub repo (e.g. `familyfinance`)
2. Upload all files maintaining the folder structure:
   ```
   index.html
   dashboard.html
   css/auth.css
   css/dashboard.css
   js/dashboard.js
   README.md
   ```
3. Go to repo **Settings** → **Pages**
4. Source: **Deploy from a branch** → **main** → **/ (root)**
5. Click **Save** → your site will be live at `https://yourusername.github.io/familyfinance`

> ⚠️ Also add your GitHub Pages URL to Firebase:
> **Authentication** → **Settings** → **Authorized domains** → Add your domain

---

## 👥 Role permissions

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
