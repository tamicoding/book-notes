## 🇺🇸 English

# BookNotes

BookNotes is a full-stack web application developed for tracking read books, personal notes, and ratings.  
The project was built with a focus on development best practices, user authentication, data persistence, and production deployment.

The main goal of this project is to demonstrate skills in JavaScript, Node.js, Express, relational databases, and authentication, serving as both a study and portfolio project.

Production deployment:  
https://book-notes-vvs0.onrender.com

---

## Features

- User registration and authentication (email and password)  
- Google login (OAuth 2.0)  
- Full CRUD operations for books (create, read, update, delete)  
- Personal notes per book  
- Book rating system  
- Password recovery via email  
- Authenticated sessions  
- Data persistence using PostgreSQL  

---

## Password Recovery

The application implements a secure password recovery flow via email.  
When a reset is requested, the system generates a temporary token, sends a reset link by email, and allows the user to create a new password.

The token has a limited validity period and is invalidated after use.  
Passwords are securely stored using bcrypt hashing.

Emails are sent via SMTP using Nodemailer, including handling for authentication failures and differences between local and production environments.

---

## Backend Technologies

- Node.js  
- Express.js  
- EJS (template engine)  
- Passport.js (Local Strategy and Google OAuth)  
- Express-session  
- Bcrypt  
- Nodemailer  

---

## Database

- PostgreSQL  
- Neon (serverless PostgreSQL)  

---

## Authentication

- Email and password  
- Google OAuth 2.0  

---

## Deployment

- Render (application hosting)  
- Neon (database hosting)  

---

## Architecture and Concepts Applied

- Separation of concerns (routes, logic, and views)  
- Session-based authentication  
- Password hashing and security best practices  
- Integration with external APIs (Google OAuth)  
- Environment variables for sensitive configuration  
- Relational database design with PostgreSQL  
- Production deployment using cloud services  

---

## Running the Project Locally

### Prerequisites

- Node.js (version 18 or higher)  
- PostgreSQL  
- Google account for OAuth (optional)  

---

### Installation

```bash
git clone https://github.com/your-username/book-notes.git
cd book-notes
npm install
Configuration
Create a .env file in the project root with the following variables:

ini
Copiar código
PORT=3000
DATABASE_URL=your_postgres_url
SESSION_SECRET=your_secret_key

GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

NODE_ENV=development
Run
bash
Copiar código
npm run dev
The application will be available at:
http://localhost:3000

Deployment
The project is deployed in production using:

Render for hosting the Node.js application

Neon as a serverless PostgreSQL database

Environment variables are configured directly in the Render dashboard.

Future Improvements
Book pagination

Categories and tags

Reading statistics

Book cover upload

UI/UX enhancements

Automated tests

Author
Developed by Tamiris, a programming student transitioning careers, focused on JavaScript, Node.js, and full-stack web development.

This project was created for study and portfolio purposes.

## PT-BR

BookNotes

BookNotes é uma aplicação web full-stack desenvolvida para registro de livros lidos, anotações pessoais e avaliações. O projeto foi criado com foco em boas práticas de desenvolvimento, autenticação de usuários, persistência de dados e deploy em ambiente de produção.

O objetivo principal é demonstrar competências em JavaScript, Node.js, Express, banco de dados relacional e autenticação, servindo como projeto de estudo e portfólio.

Deploy em produção:
https://book-notes-vvs0.onrender.com

Funcionalidades

Cadastro e autenticação de usuários (email e senha)

Login com Google (OAuth 2.0)

CRUD completo de livros (criar, listar, editar e excluir)

Anotações pessoais por livro

Avaliação de livros

Recuperação de senha via email

Sessões autenticadas

Persistência de dados em banco PostgreSQL

Recuperação de Senha

A aplicação implementa um fluxo seguro de recuperação de senha via email.
Ao solicitar a redefinição, o sistema gera um token temporário, envia um link por email e permite que o usuário crie uma nova senha. O token possui validade limitada e é invalidado após o uso. As senhas são armazenadas utilizando hash com bcrypt.

O envio de emails é feito via SMTP com Nodemailer, incluindo tratamento de falhas de autenticação e diferenças entre ambiente local e produção.

Tecnologias Utilizadas
Backend

Node.js

Express.js

EJS (template engine)

Passport.js (Local Strategy e Google OAuth)

Express-session

Bcrypt

Nodemailer

Banco de Dados

PostgreSQL

Neon (Postgres Serverless)

Autenticação

Email e senha

Google OAuth 2.0

Deploy

Render (aplicação)

Neon (banco de dados)

Arquitetura e Conceitos Aplicados

Separação de responsabilidades (rotas, lógica e views)

Autenticação baseada em sessões

Hash de senhas e boas práticas de segurança

Integração com APIs externas (Google OAuth)

Variáveis de ambiente para configuração sensível

Banco de dados relacional com PostgreSQL

Deploy em produção com serviços cloud

Como rodar o projeto localmente
Pré-requisitos

Node.js (versão 18 ou superior)

PostgreSQL

Conta Google para OAuth (opcional)

Instalação
git clone https://github.com/seu-usuario/book-notes.git
cd book-notes
npm install

Configuração

Crie um arquivo .env na raiz do projeto com as seguintes variáveis:

PORT=3000
DATABASE_URL=sua_url_do_postgres
SESSION_SECRET=sua_chave_secreta

GOOGLE_CLIENT_ID=seu_client_id
GOOGLE_CLIENT_SECRET=seu_client_secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

NODE_ENV=development

Execução
npm run dev


A aplicação estará disponível em:
http://localhost:3000

Deploy

O projeto está em produção utilizando:

Render para hospedagem da aplicação Node.js

Neon como banco de dados PostgreSQL serverless

As variáveis de ambiente são configuradas diretamente no painel do Render.

Melhorias Futuras

Paginação de livros

Categorias e tags

Estatísticas de leitura

Upload de capas de livros

Melhoria da interface e experiência do usuário

Testes automatizados

Autoria

Projeto desenvolvido por Tamiris, estudante de programação em transição de carreira, com foco em JavaScript, Node.js e desenvolvimento web full-stack.

Projeto desenvolvido para fins de estudo e portfólio.
