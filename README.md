## bot-venom-firebase

# Bot de Atendimento Via Whatsapp

Esse projeto foi desenvolvido tendo como base, a bilioteca [orkestral/venom](https://github.com/orkestral/venom) para a manipulação de chats do whatsapp, e utiliza o **Firestore**, banco de dados **NoSql** do **Firebase**.

<hr>

## Objetivo
Esta aplicação tem como objetivo o atendimento automatizado e o geresnciamento do pedido

### Funções
1. cadastro de clientes
2. gerenciamento dos pedidos
3. cadastro de endereço
4. cadastro do pedido e envio para a produção
5. cancelamento do pedido
<hr>

### Para executar o projeto
1. execute o comando: ```git clone https://github.com/jrCleber/bot-venom-firebase.git```
2. instale as dependências:
    * com gerenciador de pacores **yarn**, execute o comando: ```yarn```
    * com o **npm**, execute o comandoÇ ```npm install```
3. execute o comando ```tsc``` para compilar os arquivos typescript
4. para iniciar o aplicativo:
    * com o **yarn** execute: ```yarn start:app```
    * com o **npm** execute: ```npm run start:app```
<hr>

Essa aplicação não realiza o gerenciamento de pagamentos, roteamentos para atendentes e edições em gerais.


