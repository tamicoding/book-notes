BookNotes

BookNotes é uma aplicação web full-stack para registro de livros lidos, anotações pessoais e avaliações. O projeto possui autenticação de usuários, CRUD completo e persistência de dados em PostgreSQL hospedado na nuvem.

Deploy em produção: https://book-notes-vvs0.onrender.com

Funcionalidades

Cadastro e autenticação de usuários (email e senha)

Login com Google (OAuth 2.0)

Criação, edição, listagem e exclusão de livros

Anotações pessoais por livro

Avaliação de livros

Recuperação de senha por email

Persistência de dados em banco PostgreSQL

Tecnologias Utilizadas
Backend

Node.js

Express.js

EJS

Passport.js (Local Strategy e Google OAuth)

Express-session

Bcrypt

Nodemailer

Banco de Dados

PostgreSQL

Neon (Postgres Serverless)

Deploy

Render (aplicação)

Neon (banco de dados)

Como rodar o projeto localmente
Pré-requisitos

Node.js (v18 ou superior)

PostgreSQL

Instalação
git clone https://github.com/seu-usuario/book-notes.git
cd book-notes
npm install
Configuração

Crie um arquivo .env na raiz do projeto com as seguintes variáveis:

PORT=3000
DB_USER=postgres
DB_HOST=localhost
DB_NAME=booknotes
DB_PASSWORD=sua_senha
DB_PORT=5432
SESSION_SECRET=sua_chave_secreta
GOOGLE_CLIENT_ID=seu_client_id
GOOGLE_CLIENT_SECRET=seu_client_secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
NODE_ENV=development
Execução
npm run dev

A aplicação estará disponível em http://localhost:3000

Deploy

A aplicação está hospedada em produção utilizando Render e Neon:

https://book-notes-vvs0.onrender.com

Melhorias Futuras

Paginação de livros

Categorias e tags

Estatísticas de leitura

Melhorias de interface

Autoria

Projeto desenvolvido por Tamiris, estudante de programação em transição de carreira, com foco em JavaScript, Node.js e desenvolvimento web full-stack.

Projeto desenvolvido para fins de estudo e portfólio.