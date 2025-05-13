const bcrypt = require('bcrypt');
const fs = require('fs');

const users = {
    medicos: [
        { username: "Alexander", password: "senha123" },
        { username: "Lucas", password: "senha123" },
        { username: "Alberto", password: "senha123" }
    ],
    enfermeiras: [
        { username: "Fernanda", password: "senha123" },
        { username: "Thais", password: "senha123" },
        { username: "Ivani", password: "senha123" }
    ],
    outros: [
        { username: "Vacina", password: "senha123" },
        { username: "Triagem", password: "senha123" }
    ]
};

async function generateHashes() {
    for (const group in users) {
        for (const user of users[group]) {
            user.password = await bcrypt.hash(user.password, 10);
        }
    }

    fs.writeFileSync('users.json', JSON.stringify(users, null, 2));
    console.log('Hashes gerados e salvos no arquivo users.json!');
}

generateHashes();
