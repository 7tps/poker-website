# Poker Website

A full-stack Texas Hold'em Poker web application built with Node.js, Express, React, PostgreSQL, and Socket.IO.

---

## 🚀 Features

- **User Registration & Login** (secure, hashed passwords)
- **Real-Time Multiplayer Poker** (Socket.IO)
- **Texas Hold'em Game Logic**
- **Persistent User Data** (PostgreSQL)
- **Responsive React Frontend**
- **Dockerized** for easy development

---

## 🗂️ Project Structure

```
poker-website/
  ├── config/              # Database config
  ├── frontend/            # React frontend
  ├── models/              # Database models
  ├── public/              # Static files
  ├── routes/              # Express routes
  ├── sockets/             # Socket.IO logic
  ├── utils/               # Poker game utilities
  ├── server.js            # Express server entry
  ├── Dockerfile           # Docker build config
  ├── docker-compose.yml   # Local DB/dev setup
  ├── database-setup.sql   # SQL schema (not committed)
  ├── .gitignore
  └── README.md
```

---

## 🏁 Quick Start (Local Development)

### 1. **Clone the Repository**
```bash
git clone https://github.com/<your-username>/poker-website.git
cd poker-website
```

### 2. **Install Dependencies**
```bash
npm install
cd frontend
npm install
cd ..
```

### 3. **Set Up Local PostgreSQL (Recommended: Docker)**
```bash
docker-compose up -d
```
- This starts PostgreSQL and pgAdmin for local development.

### 4. **Configure Environment Variables**
- Copy `env.example` to `.env` and fill in your values:
  ```
  DB_USER=pokeruser
  DB_PASSWORD=pokerpassword
  DB_NAME=pokerdb
  DB_HOST=localhost
  DB_PORT=5432
  SESSION_SECRET=your_session_secret
  NODE_ENV=development
  FRONTEND_URL=http://localhost:3000
  ```

### 5. **Set Up the Database**
- Use pgAdmin or psql to run `database-setup.sql` on your local database.

### 6. **Run the Backend**
```bash
node server.js
```

### 7. **Run the Frontend**
```bash
cd frontend
npm start
```
- Visit [http://localhost:3000](http://localhost:3000)

---

## 🗄️ Database Setup (Local)

1. **Start PostgreSQL** (via Docker or local install)
2. **Create Database**: `pokerdb`
3. **Create User**: `pokeruser`
4. **Run `database-setup.sql`** using pgAdmin, psql, or Docker

---

## 🤝 Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.

---

## 📄 License

[MIT](LICENSE)

---

## 🙋‍♂️ Need Help?

Open an issue or contact the maintainer. 
