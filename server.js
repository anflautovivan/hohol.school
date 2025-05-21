const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const session = require('express-session');

const app = express();
const PORT = 3000;

// Инициализация Sequelize
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: path.join(__dirname, 'database.sqlite'),
  logging: console.log
});

// Модели
const News = sequelize.define('News', {
  title: { type: DataTypes.STRING, allowNull: false },
  url: { type: DataTypes.STRING, allowNull: false }
});

const Student = sequelize.define('Student', {
  login: { type: DataTypes.STRING, allowNull: false, unique: true },
  password: { type: DataTypes.STRING, allowNull: false },
  lastName: { type: DataTypes.STRING, allowNull: false },
  firstName: { type: DataTypes.STRING, allowNull: false },
  middleName: { type: DataTypes.STRING, allowNull: false }
});

const Admin = sequelize.define('Admin', {
  username: { type: DataTypes.STRING, allowNull: false, unique: true },
  password: { type: DataTypes.STRING, allowNull: false }
});

const CalendarEvent = sequelize.define('CalendarEvent', {
  date: { type: DataTypes.DATEONLY, allowNull: false },
  title: { type: DataTypes.STRING, allowNull: false }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));

app.use(session({
  secret: 'kafedra-cybernetics-secret',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// Middleware для проверки авторизации
const checkAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Необходима авторизация' });
  }
  next();
};

const checkAdmin = (req, res, next) => {
  if (!req.session.admin) {
    return res.status(403).json({ error: 'Доступ запрещен' });
  }
  next();
};

// API Endpoints для новостей
app.get('/api/side-news', async (req, res) => {
  try {
    const news = await News.findAll({ order: [['createdAt', 'DESC']] });
    res.json({ newsItems: news });
  } catch (error) {
    console.error('Ошибка:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.post('/api/side-news', async (req, res) => {
  try {
    const { title, url } = req.body;
    const newsItem = await News.create({ title, url });
    res.status(201).json(newsItem);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/side-news/:id', async (req, res) => {
  try {
    const deleted = await News.destroy({ where: { id: req.params.id } });
    res.json({ success: !!deleted });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// API Endpoints для календаря
app.get('/api/calendar-events', async (req, res) => {
  try {
    const events = await CalendarEvent.findAll({
      order: [['date', 'ASC']]
    });
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.post('/api/calendar-events', checkAdmin, async (req, res) => {
  try {
    const event = await CalendarEvent.create(req.body);
    res.status(201).json(event);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/calendar-events/:id', checkAdmin, async (req, res) => {
  try {
    const event = await CalendarEvent.findByPk(req.params.id);
    if (!event) {
      return res.status(404).json({ error: 'Событие не найдено' });
    }
    await event.update(req.body);
    res.json(event);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/calendar-events/:id', checkAdmin, async (req, res) => {
  try {
    const event = await CalendarEvent.findByPk(req.params.id);
    if (!event) {
      return res.status(404).json({ error: 'Событие не найдено' });
    }
    await event.destroy();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Аутентификация студентов
app.post('/auth/login', async (req, res) => {
  try {
    const { login, password } = req.body;
    
    const student = await Student.findOne({ where: { login } });
    
    if (!student || student.password !== password) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }
    
    req.session.user = {
      id: student.id,
      login: student.login,
      lastName: student.lastName,
      firstName: student.firstName,
      middleName: student.middleName,
      fullName: `${student.lastName} ${student.firstName} ${student.middleName}`
    };
    
    res.json({ 
      success: true, 
      user: {
        login: student.login,
        lastName: student.lastName,
        firstName: student.firstName,
        middleName: student.middleName
      }
    });
  } catch (error) {
    console.error('Ошибка входа:', error);
    res.status(500).json({ error: 'Ошибка сервера при входе' });
  }
});

// Выход из системы
app.post('/auth/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ error: 'Ошибка при выходе из системы' });
    }
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

// Получение информации о текущем пользователе
app.get('/auth/user', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Не авторизован' });
  }
  res.json({ user: req.session.user });
});

// Аутентификация администратора
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const admin = await Admin.findOne({ where: { username } });
    
    if (!admin || admin.password !== password) {
      return res.status(401).json({ error: 'Неверные учетные данные администратора' });
    }
    
    req.session.admin = {
      id: admin.id,
      username: admin.username
    };
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Выход администратора
app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ error: 'Ошибка при выходе из системы' });
    }
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});

// Инициализация данных
async function initializeStudents() {
  const students = [
    { login: 'kafedFITKB1', password: '7xK9pL2q', lastName: 'Смирнов', firstName: 'Артём', middleName: 'Дмитриевич' },
    { login: 'kafedFITKB2', password: 'R5tY8uI1', lastName: 'Козлова', firstName: 'Анна', middleName: 'Сергеевна' },
    { login: 'kafedFITKB3', password: '3vB6nM9k', lastName: 'Иванов', firstName: 'Максим', middleName: 'Андреевич' },
    { login: 'kafedFITKB4', password: 'Q2wE4rT7', lastName: 'Петрова', firstName: 'Елена', middleName: 'Викторовна' },
    { login: 'kafedFITKB5', password: '9oL8pA3s', lastName: 'Сидоров', firstName: 'Денис', middleName: 'Олегович' },
    { login: 'kafedFITKB6', password: '1zX7cV4b', lastName: 'Фёдорова', firstName: 'Ольга', middleName: 'Игоревна' },
    { login: 'kafedFITKB7', password: '6mJ9kL2p', lastName: 'Николаев', firstName: 'Кирилл', middleName: 'Александрович' },
    { login: 'kafedFITKB8', password: '4hG7fD1s', lastName: 'Егорова', firstName: 'Виктория', middleName: 'Павловна' },
    { login: 'kafedFITKB9', password: '8tR5yU3i', lastName: 'Васильев', firstName: 'Илья', middleName: 'Николаевич' },
    { login: 'kafedFITKB10', password: '5nB8vC2m', lastName: 'Павлова', firstName: 'София', middleName: 'Алексеевна' },
    { login: 'kafedFITKB11', password: '2kP9jH4l', lastName: 'Лебедев', firstName: 'Даниил', middleName: 'Романович' },
    { login: 'kafedFITKB12', password: '7dF3gS6h', lastName: 'Соколова', firstName: 'Алиса', middleName: 'Денисовна' },
    { login: 'kafedFITKB13', password: '9wE4rT5y', lastName: 'Морозов', firstName: 'Алексей', middleName: 'Владимирович' },
    { login: 'kafedFITKB14', password: '1qA2zS3x', lastName: 'Ковалёва', firstName: 'Полина', middleName: 'Ильинична' },
    { login: 'kafedFITKB15', password: '4vB7nM1k', lastName: 'Захаров', firstName: 'Михаил', middleName: 'Сергеевич' },
    { login: 'kafedFITKB16', password: '6cX9zL2p', lastName: 'Антонова', firstName: 'Дарья', middleName: 'Андреевна' },
    { login: 'kafedFITKB17', password: '3mK8jL5h', lastName: 'Борисов', firstName: 'Роман', middleName: 'Олегович' },
    { login: 'kafedFITKB18', password: '8pO7iU2y', lastName: 'Кузнецова', firstName: 'Валерия', middleName: 'Артёмовна' },
    { login: 'kafedFITKB19', password: '5tR6yU1i', lastName: 'Воробьёв', firstName: 'Артём', middleName: 'Денисович' },
    { login: 'kafedFITKB20', password: '2sD4fG7h', lastName: 'Орлова', firstName: 'Ксения', middleName: 'Витальевна' },
    { login: 'kafedFITKB21', password: '7gH3jK9l', lastName: 'Герасимов', firstName: 'Никита', middleName: 'Игоревич' },
    { login: 'kafedFITKB22', password: '9lP5oI8u', lastName: 'Тихонова', firstName: 'Екатерина', middleName: 'Анатольевна' },
    { login: 'kafedFITKB23', password: '1bN4mK7j', lastName: 'Филиппов', firstName: 'Станислав', middleName: 'Васильевич' },
    { login: 'kafedFITKB24', password: '4zX7cV2b', lastName: 'Макарова', firstName: 'Вероника', middleName: 'Романовна' }
  ];

  // Создание администратора по умолчанию
  await Admin.findOrCreate({
    where: { username: 'admin' },
    defaults: { password: 'admin123' }
  });

  // Создание студентов
  for (const student of students) {
    await Student.findOrCreate({
      where: { login: student.login },
      defaults: student
    });
  }
  
  console.log('Данные студентов и администратора инициализированы');
}
// Запуск сервера
async function start() {
  try {
    await sequelize.sync();
    await initializeStudents();
    
    app.listen(PORT, () => {
      console.log(`Сервер запущен на http://localhost:${PORT}`);
      console.log(`Админ-панель: http://localhost:${PORT}/admin`);
    });
  } catch (error) {
    console.error('Error starting server:', error);
  }
}

start();