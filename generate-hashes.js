const bcrypt = require('bcrypt');
const fs = require('fs');

// Carregar os usuários existentes do arquivo users.json
let users;
try {
    users = JSON.parse(fs.readFileSync('users.json', 'utf-8'));
} catch (err) {
    console.error('Erro ao carregar o arquivo users.json:', err);
    users = { medicos: [], enfermeiras: [], outros: [] }; // Inicializa se o arquivo não existir
}

// Adicionar um novo usuário
async function addUser(username, password, role) {
    if (!users[role]) {
        console.log('Função inválida.');
        return;
    }

    // Hash da senha
    const hashedPassword = await bcrypt.hash(password, 10);

    // Verifica se o usuário já existe
    const existingUserIndex = users[role].findIndex(u => u.username === username);
    if (existingUserIndex !== -1) {
        console.log('Usuário já existe. Atualizando a senha...');
        users[role][existingUserIndex].password = hashedPassword;
    } else {
        console.log('Adicionando novo usuário...');
        users[role].push({ username, password: hashedPassword });
    }

    // Atualiza o arquivo users.json
    try {
        fs.writeFileSync('users.json', JSON.stringify(users, null, 2));
        console.log('Usuário registrado com sucesso!');
    } catch (err) {
        console.error('Erro ao atualizar o arquivo users.json:', err);
    }
}

// Exemplo de uso
(async () => {
    const username = 'NovoUsuario';
    const password = 'senha123';
    const role = 'medicos';

    await addUser(username, password, role);
})();
