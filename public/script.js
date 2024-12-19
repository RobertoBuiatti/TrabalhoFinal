const socket = io();
const messagesDiv = document.getElementById('messages');
const userListDiv = document.getElementById('user-list');
const loginContainer = document.getElementById('login-container');
const loginUsernameInput = document.getElementById('login-username');
const loginColorInput = document.getElementById('login-color');
const loginButton = document.getElementById('login-button');
const messageInput = document.getElementById('message');
const sendButton = document.getElementById('send');
const imageUpload = document.getElementById('imageUpload');
const notificationSound = document.getElementById('notificationSound');

let username;
let userColor;
let selectedUserId = 'all';
let messageCounts = {};

// Evento para login
loginButton.addEventListener('click', () => {
    username = loginUsernameInput.value;
    userColor = loginColorInput.value;
    socket.emit('login', { username, color: userColor });
    loginContainer.style.display = 'none';
    document.querySelector('.main-content').style.display = 'flex';
    document.querySelector('.input-area').style.display = 'flex';
});

// Envia mensagem
sendButton.addEventListener('click', () => {
    const message = messageInput.value;
    if (message.trim() === '') {
        alert('Por favor, digite uma mensagem antes de enviar.');
        return;
    }
    socket.emit('sendMessage', { message, recipientId: selectedUserId });
    messageInput.value = '';
});

// Envia imagem
imageUpload.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = () => {
            socket.emit('sendMessage', { message: `<img src="${reader.result}" />`, recipientId: selectedUserId });
        };
        reader.readAsDataURL(file);
    }
});

// Recebe mensagem
socket.on('receiveMessage', (data) => {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    messageElement.classList.add(data.sender.name === username ? 'sent' : 'received');
    if (data.recipientId && data.recipientId !== 'all') {
        messageElement.classList.add('private');
        if (!messageCounts[data.sender.id]) {
            messageCounts[data.sender.id] = 0;
        }
        messageCounts[data.sender.id]++;
        updateMessageCount(data.sender.id);
    }
    messageElement.innerHTML = `<span style="color: ${data.sender.color}">${data.sender.name}</span> ${data.message}`;
    messagesDiv.appendChild(messageElement);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    if (notificationSound) {
        notificationSound.play();
    }
});

// Atualiza lista de usuários
socket.on('updateUserList', (users) => {
    userListDiv.innerHTML = '<h2>Usuários</h2><div class="user" data-id="all"><span>Todos</span></div>';
    users.forEach((user) => {
        const userElement = document.createElement('div');
        userElement.textContent = user.name;
        userElement.style.color = user.color;
        userElement.classList.add('user');
        userElement.dataset.id = user.id;

        const blockButton = document.createElement('button');
        blockButton.textContent = 'Bloquear';
        blockButton.classList.add('block-button');
        blockButton.addEventListener('click', (event) => {
            event.stopPropagation();
            socket.emit('blockUser', user.id);
            userElement.classList.add('blocked');
        });

        const unblockButton = document.createElement('button');
        unblockButton.textContent = 'Desbloquear';
        unblockButton.classList.add('unblock-button');
        unblockButton.addEventListener('click', (event) => {
            event.stopPropagation();
            socket.emit('unblockUser', user.id);
            userElement.classList.remove('blocked');
        });

        userElement.appendChild(blockButton);
        userElement.appendChild(unblockButton);

        userElement.addEventListener('click', () => {
            document.querySelectorAll('.user').forEach((el) => el.classList.remove('selected'));
            userElement.classList.add('selected');
            selectedUserId = user.id;
            updateMessageCount(user.id, true);
        });

        const messageCountElement = document.createElement('span');
        messageCountElement.classList.add('message-count');
        userElement.appendChild(messageCountElement);
        userListDiv.appendChild(userElement);
    });

    // Adiciona evento para o usuário "Todos"
    document.querySelector('.user[data-id="all"]').addEventListener('click', () => {
        document.querySelectorAll('.user').forEach((el) => el.classList.remove('selected'));
        document.querySelector('.user[data-id="all"]').classList.add('selected');
        selectedUserId = 'all';
    });
});

function updateMessageCount(userId, reset = false) {
    const userElement = document.querySelector(`.user[data-id="${userId}"]`);
    if (userElement) {
        const messageCountElement = userElement.querySelector('.message-count');
        if (reset) {
            messageCounts[userId] = 0;
        }
        messageCountElement.textContent = messageCounts[userId] > 0 ? `(${messageCounts[userId]})` : '';
    }
}

