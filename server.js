const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = process.env.PORT || 3000;

const dbUser = process.env.DATABASE_USER;
const dbPass = process.env.DATABASE_PASS;
const dbUrl = process.env.DATABASE_URL.replace('<password>', dbPass);

mongoose.connect(dbUrl)
    .then(() => console.log("Conectado ao MongoDB"))
    .catch((err) => console.error("Erro ao conectar ao MongoDB:", err));

const messageSchema = new mongoose.Schema({
    sender: String,
    recipient: String,
    message: String,
    timestamp: { type: Date, default: Date.now }
});

const Message = mongoose.model("Message", messageSchema);

const userSchema = new mongoose.Schema({
    username: String,
    color: String,
    socketId: String,
    blockedUsers: [String]
});

const User = mongoose.model("User", userSchema);

let users = [];
let blockedUsers = {};

// Middleware para analisar o corpo das requisições
app.use(express.json());
app.use(express.static("public"));

// Rota para a página inicial
app.get("/", (req, res) => {
    res.sendFile(__dirname + "/public/index.html");
});

// Rota para obter a lista de usuários
app.get("/users", (req, res) => {
    res.json(users);
});

// Rota para obter um usuário específico
app.get("/users/:id", (req, res) => {
    const user = users.find((u) => u.id === req.params.id);
    if (user) {
        res.json(user);
    } else {
        res.status(404).send("Usuário não encontrado");
    }
});

// Rota para adicionar um novo usuário
app.post("/users", (req, res) => {
    const { username, color } = req.body;
    const newUser = { id: Date.now().toString(), name: username, color: color };
    users.push(newUser);
    io.emit("updateUserList", users);
    res.status(201).json(newUser);
});

// Rota para atualizar um usuário
app.put("/users/:id", (req, res) => {
    const userIndex = users.findIndex((u) => u.id === req.params.id);
    if (userIndex !== -1) {
        users[userIndex] = { ...users[userIndex], ...req.body };
        io.emit("updateUserList", users);
        res.json(users[userIndex]);
    } else {
        res.status(404).send("Usuário não encontrado");
    }
});

// Rota para remover um usuário
app.delete("/users/:id", (req, res) => {
    const userIndex = users.findIndex((u) => u.id === req.params.id);
    if (userIndex !== -1) {
        users.splice(userIndex, 1);
        io.emit("updateUserList", users);
        res.status(204).send();
    } else {
        res.status(404).send("Usuário não encontrado");
    }
});

// Rota para obter o histórico de mensagens
app.get("/messages", async (req, res) => {
    const messages = await Message.find().sort({ timestamp: -1 }).limit(10);
    res.json(messages);
});

// Evento de conexão do Socket.io
io.on("connection", (socket) => {
    console.log("Um usuário se conectou:", socket.id);

    // Login do usuário
    socket.on("login", async (data) => {
        let user = await User.findOne({ username: data.username });
        if (!user) {
            user = new User({ username: data.username, color: data.color, socketId: socket.id });
            await user.save();
        } else {
            user.socketId = socket.id;
            await user.save();
        }
        users.push({ id: socket.id, name: data.username, color: data.color });
        io.emit("updateUserList", users);
    });

    // Adiciona novo usuário
    socket.on("newUser", (data) => {
        const newUser = { id: socket.id, name: data.username, color: data.color };
        users.push(newUser);
        io.emit("updateUserList", users);
    });

    // Envia mensagem
    socket.on("sendMessage", async (data) => {
        const sender = users.find((u) => u.id === socket.id);
        const message = new Message({
            sender: sender.name,
            recipient: data.recipientId,
            message: data.message
        });
        await message.save();

        if (data.recipientId && data.recipientId !== 'all') {
            const recipient = users.find((u) => u.id === data.recipientId);
            if (recipient && !blockedUsers[recipient.id]?.includes(sender.id)) {
                io.to(data.recipientId).emit("receiveMessage", { message: data.message, sender });
            }
        } else {
            if (!blockedUsers[socket.id]?.includes(sender.id)) {
                io.emit("receiveMessage", { message: data.message, sender });
            }
        }
    });

    // Bloqueia usuário
    socket.on("blockUser", async (userId) => {
        let user = await User.findOne({ socketId: socket.id });
        if (user) {
            user.blockedUsers.push(userId);
            await user.save();
        }
        if (!blockedUsers[socket.id]) {
            blockedUsers[socket.id] = [];
        }
        blockedUsers[socket.id].push(userId);
    });

    // Desbloqueia usuário
    socket.on("unblockUser", async (userId) => {
        let user = await User.findOne({ socketId: socket.id });
        if (user) {
            user.blockedUsers = user.blockedUsers.filter(id => id !== userId);
            await user.save();
        }
        if (blockedUsers[socket.id]) {
            blockedUsers[socket.id] = blockedUsers[socket.id].filter(id => id !== userId);
        }
    });

    // Evento de desconexão
    socket.on("disconnect", async () => {
        users = users.filter((u) => u.id !== socket.id);
        io.emit("updateUserList", users);
        console.log("Um usuário se desconectou:", socket.id);

        // Se não houver mais usuários conectados, apaga todos os usuários e mensagens
        if (users.length === 0) {
            await User.deleteMany({});
            await Message.deleteMany({});
            console.log("Todos os usuários e mensagens foram apagados.");
        }
    });
});

// Inicia o servidor
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});