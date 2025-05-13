const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*", // Permitir de qualquer origem durante o desenvolvimento
        methods: ["GET", "POST"]
    }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Carregar usuários do arquivo users.json
let users;
try {
    users = JSON.parse(fs.readFileSync('users.json', 'utf-8'));
} catch (err) {
    console.error('Erro ao carregar o arquivo users.json:', err);
    users = { medicos: [], enfermeiras: [], outros: [] }; // Inicializa se o arquivo não existir
}

// --- ROTAS DE AUTENTICAÇÃO ---

// Login de usuário
app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    // Busca o usuário no arquivo users.json
    let user = null;
    for (const group in users) {
        user = users[group].find(u => u.username === username);
        if (user) break;
    }

    // Verifica se o usuário existe
    if (!user) {
        return res.status(401).send('Usuário não encontrado.');
    }

    // Verifica a senha
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
        return res.status(401).send('Senha inválida.');
    }

    // Geração do JWT
    const token = jwt.sign({ username: user.username }, 'secret_key', { expiresIn: '1h' });
    res.json({ token });
});

// Rota para registrar novos usuários
app.post('/register', async (req, res) => {
    const { username, password, role } = req.body;

    if (!username || !password || !role) {
        return res.status(400).send('Todos os campos são obrigatórios.');
    }

    if (!users[role]) {
        return res.status(400).send('Função inválida.');
    }

    // Hash da senha
    const hashedPassword = await bcrypt.hash(password, 10);

    // Verifica se o usuário já existe
    const existingUserIndex = users[role].findIndex(u => u.username === username);
    if (existingUserIndex !== -1) {
        // Atualiza a senha do usuário existente
        users[role][existingUserIndex].password = hashedPassword;
    } else {
        // Adiciona um novo usuário
        users[role].push({ username, password: hashedPassword });
    }

    // Atualiza o arquivo users.json
    try {
        fs.writeFileSync('users.json', JSON.stringify(users, null, 2));
        res.status(201).send('Usuário registrado com sucesso!');
    } catch (err) {
        console.error('Erro ao atualizar o arquivo users.json:', err);
        res.status(500).send('Erro ao registrar o usuário.');
    }
});

// Rota protegida (exemplo)
app.get('/dashboard', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).send('Token não fornecido');

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, 'secret_key');
        res.json({ message: `Bem-vindo, ${decoded.username}!` });
    } catch {
        res.status(403).send('Token inválido');
    }
});

// --- SOCKET.IO ---

let patientQueue = []; // Fila de pacientes na memória do servidor
let currentlyCallingPatient = null; // Paciente sendo chamado no momento
let youtubePlaylistUrl = null; // URL da playlist do YouTube
let connectedProfessionals = {}; // Profissionais conectados

io.on('connection', (socket) => {
    console.log('Novo cliente conectado:', socket.id);

    // Enviar o estado atual para o cliente que acabou de conectar
    socket.emit('current_state', {
        patients: patientQueue,
        calling: currentlyCallingPatient,
        playlistUrl: youtubePlaylistUrl,
        professionals: Object.values(connectedProfessionals)
    });

    // Login de profissional
    socket.on('professional_login', (professionalInfo) => {
        if (!professionalInfo || !professionalInfo.name || !professionalInfo.role) {
            socket.emit('error_message', 'Informações de login inválidas.');
            return;
        }
        connectedProfessionals[socket.id] = professionalInfo;
        console.log(`Profissional "${professionalInfo.name}" (${professionalInfo.role}) logado (ID: ${socket.id}).`);
        io.emit('professional_list_updated', Object.values(connectedProfessionals));
    });

    // Logout de profissional
    socket.on('professional_logout', () => {
        const professionalInfo = connectedProfessionals[socket.id];
        if (professionalInfo) {
            delete connectedProfessionals[socket.id];
            console.log(`Profissional "${professionalInfo.name}" (${professionalInfo.role}) deslogado (ID: ${socket.id}).`);
            io.emit('professional_list_updated', Object.values(connectedProfessionals));

            if (currentlyCallingPatient && currentlyCallingPatient.calledBySocketId === socket.id) {
                currentlyCallingPatient = null;
                io.emit('call_stopped');
                console.log(`Chamada parada pois o profissional "${professionalInfo.name}" deslogou.`);
            }
        }
    });

    // Adicionar paciente
    socket.on('add_patient', (patientData) => {
        const professionalInfo = connectedProfessionals[socket.id];
        if (!professionalInfo) {
            socket.emit('error_message', 'Você precisa estar logado para adicionar pacientes.');
            return;
        }

        if (!patientData || !patientData.name) {
            socket.emit('error_message', 'Dados do paciente inválidos.');
            return;
        }

        const newPatient = {
            id: 'patient_' + Date.now(),
            name: patientData.name,
            priority: patientData.priority || 'normal',
            addedTime: Date.now(),
            addedBy: professionalInfo,
            addedBySocketId: socket.id
        };
        patientQueue.push(newPatient);
        sortPatientQueue();
        io.emit('queue_updated', patientQueue);
        console.log(`Paciente "${newPatient.name}" adicionado por "${professionalInfo.name}" (${professionalInfo.role}).`);
    });

    // Chamar paciente
    socket.on('call_patient', (patientId) => {
        const professionalInfo = connectedProfessionals[socket.id];
        if (!professionalInfo) {
            socket.emit('error_message', 'Você precisa estar logado para chamar pacientes.');
            return;
        }

        const patientIndex = patientQueue.findIndex(p => p.id === patientId);

        if (patientIndex !== -1 && !currentlyCallingPatient) {
            const patientToCall = patientQueue[patientIndex];

            if (patientToCall.addedBySocketId === socket.id) {
                patientQueue.splice(patientIndex, 1);

                currentlyCallingPatient = {
                    ...patientToCall,
                    calledBy: professionalInfo,
                    calledBySocketId: socket.id
                };

                io.emit('queue_updated', patientQueue);
                io.emit('patient_called', currentlyCallingPatient);
                console.log(`Paciente "${patientToCall.name}" chamado por "${professionalInfo.name}" (${professionalInfo.role}).`);
            } else {
                socket.emit('error_message', 'Você só pode chamar pacientes que você adicionou à fila.');
            }
        } else if (currentlyCallingPatient) {
            socket.emit('error_message', `Já há um paciente sendo chamado: ${currentlyCallingPatient.name}.`);
        } else {
            socket.emit('error_message', 'Paciente não encontrado na fila.');
        }
    });

    // Desconexão
    socket.on('disconnect', () => {
        const professionalInfo = connectedProfessionals[socket.id];
        if (professionalInfo) {
            delete connectedProfessionals[socket.id];
            console.log(`Profissional "${professionalInfo.name}" desconectado (ID: ${socket.id}).`);
            io.emit('professional_list_updated', Object.values(connectedProfessionals));

            if (currentlyCallingPatient && currentlyCallingPatient.calledBySocketId === socket.id) {
                currentlyCallingPatient = null;
                io.emit('call_stopped');
            }
        }
    });
});

// Função para ordenar a fila de pacientes
function sortPatientQueue() {
    patientQueue.sort((a, b) => {
        if (a.priority === 'high' && b.priority !== 'high') return -1;
        if (b.priority === 'high' && a.priority !== 'high') return 1;
        return a.addedTime - b.addedTime;
    });
}

// Redirecionar a rota inicial
app.get('/', (req, res) => {
    res.redirect('/medico.html');
});

// Inicialização do servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});
