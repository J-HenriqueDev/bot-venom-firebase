// importando enumerações
import { EnumField as Field } from '../utils/enum'
// importando tipagens do venom
import { Message, Whatsapp } from 'venom-bot'
// importando função para abrir diretórios
import { opendir } from 'fs/promises'
// importando configurações de botões
import buttons from '../jsonConfig/actionsBot.json'
// importando as configurações do bot
import botConfig from '../jsonConfig/settingsBot.json'
// importando o controller da aplicação
import { AppController } from "../controller/appController"
// importando arquivo de dados, estático, para criação do menu
import menuList from '../data/menuList.json'
//importando nome das collections
import collection from '../data/collectionsNames.json'
// importando interfaces
import { TRowsMenu, TButtons, TOrder, TAddress, TDataTemp } from '../types/types'
// importandp firestore para tipagem
import { firestore } from 'firebase-admin'
// importando opções de respostas/comando
import { orderCommands } from "./commands"
// importando sync-request para busca de cep
// import request from 'sync-request'
// farei a busca de CEP com protocolo https
import { get } from 'https'

// formatando botão
function createButtons(array: string[]) {
    const listButton: TButtons = []
    array.forEach(b => {
        listButton.push({
            buttonText: {
                displayText: b
            }
        })
    })
    return listButton
}

// formatando menuList
function createListMenu() {
    // criando uma lista única de categorias
    const category = [...new Set(menuList.map(m => m.category))]
    // formatando
    return Array.from(category, c => {
        const rows: TRowsMenu = []
        const title = c.toUpperCase()
        menuList.forEach(m => {
            if (m.category === c) {
                m.rows.forEach(r => {
                    rows.push({
                        title: `${r.title} ${r.price.toLocaleString('us', { style: 'currency', currency: 'BRL' })}`,
                        description: r.description
                    })
                })
            }
        })
        return { title, rows }
    })
}

// função que exibe para o cliente a evolução e finalização do pedido
async function displayOrder(id: string) {
    let totalOrder = 0.0
    let textOrder = ''
    /* RECUPERANDO DADOS TEMPORAIS DO CLIENTE */
    // referenciando documento
    const documentReferemces = await chatControll.getDocumetId(id)
    // alocando os dados
    const documentData = documentReferemces!.data()
    // preenchendo as variáveis
    const orderList: TOrder[] = documentData[Field.tempOrderList]
    const address: TAddress = documentData[Field.tempAddress]
    // montando display
    orderList.forEach((order: TOrder) => {
        totalOrder += order.quantity! * order.price
        textOrder += '```' + order.title + '```\n'
        textOrder += '```' + order.quantity + ' x ' + order.price.toLocaleString('us', { style: 'currency', currency: 'BRL' })
        textOrder += ' = ' + (order.quantity! * order.price).toLocaleString('us', { style: 'currency', currency: 'BRL' }) + '```\n\n'
    })
    textOrder += `total do pedido *${totalOrder.toLocaleString('us', { style: 'currency', currency: 'BRL' })}*`
    // verificando se existe endereço para associar ao display
    if (address) {
        textOrder += `\n\n*cidade:*  ${address.city}
        *bairro:*  ${address.distryct}
        *rua/localização:*  ${address.publicPlace}
        *número:*  ${address.number}`
    }
    return textOrder
}

function seeTyping(client: Whatsapp, from: string) {
    client.sendSeen(from)
    client.startTyping(from)
}

// instanciando controller que gerenciaram as collections
const orderControll = new AppController(collection.collOrder)
const customerControll = new AppController(collection.collCustomer)
const chatControll = new AppController(collection.collChatControll)

// debug
const log = (value: any) => console.log(value)

// tipando variável de comandos
let command: keyof typeof manageOrder | keyof typeof manageAddress

// setando função fieldValue
// esta função nos dá mais controle sobre os campos da collection
const fieldValue = firestore.FieldValue

// gerenciamento de ordem
const manageOrder = {
    // validando a quantidade
    async validateQuantity(message: Message, client: Whatsapp) {
        seeTyping(client, message.from)
        /* no message.body recebemos aquantidade
           agora checaresmos se a quantidade recebidade é realmente um número inteiro, onforme definido na regra de negócio
           e se esse número é maior que zero */
        if (Number.isInteger(parseInt(message.body)) && parseInt(message.body) > 0) {
            // referenciando documento
            const documentReferemces = await chatControll.getDocumetId(message.chatId)
            // alocando dados
            const documentData = documentReferemces!.data()
            // alocando lista de pedidos
            let orderList: TOrder[] = documentData[Field.tempOrderList]
            // capturando o index do último pedido configurado pelo cliente
            const index = orderList.length - 1
            // alocando a última orderm configurada pelo cliente
            let order: TOrder = orderList[index]
            /*  OBS: no firebase ainda não é possível atualizar um item no array, ou removemos ou adicionamos.
                por isso vamos remover do banco o objeto order capturado em orderList  */
            await chatControll.updateDoc(message.chatId, Field.tempOrderList, fieldValue.arrayRemove(order), false)
            // preenchendo a quantidade na orderm
            order.quantity = parseInt(message.body)
            // recolocando orden no array do banco
            await chatControll.updateDoc(message.chatId, Field.tempOrderList, fieldValue.arrayUnion(order), false)
            // perguntando se o cliente deseja adicionar um novo item
            client.sendButtons(
                message.from,
                'Você deseja adcionar um novo item ao pedido?',
                createButtons(buttons.buttonsAddItemOrder),
                botConfig.botName
            )
                .then(result => {
                    client.stopTyping(message.from)
                    // alterando subestágio para addOrder
                    chatControll.updateDoc(message.chatId, Field.subState, 'addOrder', false)
                })
                .catch(err => console.log('Erro ao enviar - f validateQuantity - true: ', err))
        } else {
            // informando para o cliente que a quantidade digitada é inválida
            client.sendButtons(
                message.from,
                `Então🤨! A quantidade digitada para o produto *(* ${message.body} *)* deve ser um número, e deve ser  maior que zero.\n
                ⚠ *ATENÇÃO* ⚠
                ❱❱ DIGITE UM VALOR *NUMÉRICO INTEIRO*
                ➥ *Ex: 2*\n
                Ou clique no botão e cancele o pedido.`.replace(/^ +/gm, ''),
                createButtons(buttons.buttonCancell),
                botConfig.botName
            )
                .then(result => client.stopTyping(message.from))
                .catch(err => console.log('Erro ao enviar - f validateQuantity - false: ', err))
        }

    },
    // adicionando item ao pedido
    async addOrder(message: Message, client: Whatsapp) {
        // chamando a função initOrder para apresentar novamente o cardápio para o cliente para o cliente
        /* nesse estágio do atendimento, o subestágio do cliente ainda estará como 'addOrder'.
           Por isso, quando o cliente escolher um novo item para adicionar ao pedido, esta função será executada novamente.
           Precisamos, neste ponto alterar o subestágio do cliente para nulo ou vazio  */
        manageChat.initOrder(message, client, true)
        // atualizando subestágio do cliente
        chatControll.updateDoc(message.from, Field.subState, null, false)
    },
    // o cliente decidiu não adicionar mais algum item ao pedido
    // exibir resumo do pedido
    async notAdd(message: Message, client: Whatsapp) {
        // o cliente não deseja mais adicionar itens
        // apresentar a evolução do pedido até o momento
        const textOrder = `*produtos*\n\n${await displayOrder(message.chatId)}`.toUpperCase().replace(/^ +/gm, '')
        client.sendButtons(
            message.from,
            textOrder,
            createButtons(buttons.buttonsOrder),
            botConfig.botName
        )
            .then(result => client.stopTyping(message.from))
            .catch(err => console.log('Erro ao enviar - f notAdd: ', err))
    }
}

// gerenciamento de endereço
const manageAddress = {
    // checando o cep e salvando
    checkZipCode(message: Message, client: Whatsapp) {

        // respondendo caso a solicitação retorne inválida
        const responseError = () => client.reply(
            message.from,
            'Este *CEP* não não é válido.\nDigite novamente o cep:',
            message.id
        )
            .then(result => client.stopTyping(message.from))
            .catch(err => console.log('Erro ao enviar - f checkZipCode responseError: ', err))
        // respondendo caso a solicitação retorne válida
        const responseSuccess = (text: string) => client.sendText(message.from, text)
            .then(result => client.stopTyping(message.from))
            .catch(err => console.log('Erro ao enviar - f checkZipCode responseSuccess: ', err))

        // validando CEP recebido no body
        const regex = new RegExp(/[\d]+/g)
        // a variável conterá um array de números no formato string
        const arrayMatch = message.body.match(regex)
        // compondo zipCode
        let zipCode = ''
        for (let i = 0; i < arrayMatch!.length; i++) zipCode += arrayMatch![i]
        // checando o comprimento do CEP, se não, executar o responseError.
        if (zipCode.length === 8) {
            const host = `https://viacep.com.br/ws/${zipCode}/json/`
            // abrindo requisição e recuperando dados com o https nativo do node
            const req = get(host, (res) => {
                console.log('Status', res.statusCode)
                if (res.statusCode === 200) {
                    res.on('data', body => {
                        const cep = JSON.parse(body)
                        if (cep.erro) responseError()
                        else {
                            log(cep)
                            // se não houver erro
                            let address: TAddress = {}
                            // pegando a cidade
                            address.city = cep.localidade
                            /*  se o atributo bairro da variável cep estiver vazio,
                                os outros atributos também estarão. portanto podemos setar o subestágio
                                do atendimento como 'aguardando bairro' */
                            let sendMessage: string
                            if (cep.bairro === '') {
                                sendMessage = `*Cidade:* ${address.city}\n
                                    Digite agora o seu bairro:`.replace(/^ +/gm, '')
                                responseSuccess(sendMessage)
                                // setando subestágio como aguardado o bairro
                                chatControll.updateDoc(message.chatId, Field.subState, 'checkDistrict', false)
                            } else if (cep.logradouro === '') {
                                address.distryct = cep.bairro
                                sendMessage = `➠ *Cidade:* ${address.city}
                                    ➠ *Bairro:* ${address.distryct}\n
                                    Digite agora o seu logradouro: (rua, ou avenida, ou rodovia, etc)`.replace(/^ +/gm, '')
                                responseSuccess(sendMessage)
                                // setando subestágio como aguardado o logradouro
                                chatControll.updateDoc(message.chatId, Field.subState, 'checkPublicPlace', false)
                            } else {
                                address.distryct = cep.bairro
                                address.publicPlace = cep.logradouro
                                sendMessage = `➠ *Cidade:* ${address.city}
                                    ➠ *Bairro:* ${address.distryct}
                                    ➠ *Logradouro*: ${address.publicPlace}\n
                                    Digite agora o numero da residência para a entrega:`.replace(/^ +/gm, '')
                                responseSuccess(sendMessage)
                                // setando subestágio como aguardado número da residência
                                chatControll.updateDoc(message.chatId, Field.subState, 'checkNumber', false)
                            }
                            // inserindo dados da variável address de forma temporal em chatCpntroll
                            chatControll.updateDoc(message.chatId, Field.tempAddress, address, false)
                        }
                    })
                }
            })
            //fechandp requisição
            req.end(() => log('Requisição finalizada'))
        } else responseError()
        /* 
            recuperando dados com o método GET do sync-reques
            const res = request('GET', host)
            verificando se o CEP é válido
            if (!res.isError()) {
                const body = JSON.parse(res.body.toString('utf-8'))
                console.log(body)
            } else {
                // cep não encontrado
                console.log('Cep não encontrado')
            } 
        */
    },
    // checando bairro e salvando
    async checkDistrict(message: Message, client: Whatsapp) {
        const district = message.body
        // referenciando documento
        const documentReferemces = await chatControll.getDocumetId(message.chatId)
        // alocando dados
        const documentData = documentReferemces!.data()
        // setando endereço
        let address: TAddress = documentData[Field.tempAddress]
        // adicionando bairro ao endereço
        address.distryct = district
        // atualizando endereço
        chatControll.updateDoc(message.chatId, Field.tempAddress, address)
        // atualizando subestágio
        chatControll.updateDoc(message.chatId, Field.subState, 'checkPublicPlace', false)
        // enviando mensagem para o cliente preencher o logradouro(rua, avenida, rodovia, etc)
        client.sendText(
            message.from,
            '*Digite agora o logradouro.*\n(rua, avenida, rodovia, etc)\n\n*Ex:* Rua Dom Joaquim Silva'
        )
            .then(result => client.stopTyping(message.from))
            .catch(err => console.log('Erro ao enviar - f checkDistrict: ', err))
    },
    // checando logradouro
    async checkPublicPlace(message: Message, client: Whatsapp) {
        const publicPlace = message.body
        // referenciando documento
        const documentReferemces = await chatControll.getDocumetId(message.chatId)
        // alocando dados
        const documentData = documentReferemces!.data()
        // setando endereço
        let address: TAddress = documentData[Field.tempAddress]
        // atribuindo bairro ao endereço
        address.publicPlace = publicPlace
        // atualizando endereço
        chatControll.updateDoc(message.chatId, Field.tempAddress, address)
        // atualizando subestágio
        chatControll.updateDoc(message.chatId, Field.subState, 'checkNumber', false)
        // enviando mensagem para o cliente preencher o logradouro(rua, avenida, rodovia, etc)
        client.sendText(
            message.from,
            '*Digite agora o número se houver.*\n\n*Ex:* 1254 ou S/N'
        )
            .then(result => client.stopTyping(message.from))
            .catch(err => console.log('Erro ao enviar - f checkPublicPlace: ', err))
    },
    // checando número
    async checkNumber(message: Message, client: Whatsapp) {
        const number = message.body
        // referenciando documento
        const documentReferemces = await chatControll.getDocumetId(message.chatId)
        // alocando dados
        const documentData = documentReferemces!.data()
        // setando endereço
        let address: TAddress = documentData[Field.tempAddress]
        // atribuindo bairro ao endereço
        address.number = number
        // atualizando endereço
        chatControll.updateDoc(message.chatId, Field.tempAddress, address)
        // atualizando subestágio
        chatControll.updateDoc(message.chatId, Field.codeState, 'orderEnd', false)
        // enviando o resumo final do pedido para o cliente
        client.sendText(
            message.from,
            'Ótimo!😉\nEntão o seu pedido ficou assim: 📝'
        )
            .then(async result => {
                const textOrder = `*produtos*\n\n${await displayOrder(message.chatId)}`.toUpperCase().replace(/^ +/gm, '')
                client.sendButtons(
                    message.from,
                    textOrder,
                    createButtons(buttons.buttosnOrderEnd),
                    botConfig.botName
                )
                    .then(result => client.stopTyping(message.from))
                    .catch(err => console.log('Erro ao enviar - f checkNumber - sendButtons: ', err))
            })
            .catch(err => console.log('Erro ao enviar - f checkNumber - sendText: ', err))
    }
}

// gerenciamento de chat
const manageChat = {
    // iniciando o atendimento a partir de qualquer mensagem recebida
    async initChat(message: Message, client: Whatsapp) {
        seeTyping(client, message.chatId)
        // capturando informações de contato
        const contact = message.sender
        // coletando os dados do cliente
        const data = {
            name: contact.notifyName,
            // caso a propriedade 'imgFull' do objeto 'profilePicThumbObj', retorne um valor inválido,
            // preencheremos o campo com uma string vazia
            profilePicThum: contact.profilePicThumbObj.imgFull ? contact.profilePicThumbObj.imgFull : '',
            isBusiness: contact.isBusiness
        }
        // gravando dados no firebase
        // collection - person
        customerControll.insertDocWithId(contact.id, data)
        // setando estágio do cliente
        // collection - chatControll
        const state = { codeState: 'initChat' }
        chatControll.insertDocWithId(message.chatId, state, false)
        client.sendButtons(
            message.from,
            `Olá! Bem vindo ao *${botConfig.companyName}*😁!
            Eu sou o *${botConfig.botName}*, e estou aqui para te auxiliar no seu atendimento.
            Como posso te ajudar?`.replace(/^ +/gm, ''),
            createButtons(buttons.buttonsListInit),
            botConfig.shortName
        )
            .then(result => {
                client.stopTyping(message.from)
                // checando resultado do envio da mensagem
                console.log('Resultado: ', result)
            })
            .catch(err => console.error('Erro - f initChat: ', err))
    },
    // enviando o cardápio em imagem
    async sendMenuImage(message: Message, client: Whatsapp) {
        seeTyping(client, message.from)
        const path = './app/assets'
        const dir = await opendir(path)
        let page = 1
        for await (const dirent of dir) {
            client.sendImage(message.from, `${path}/${dirent.name}`, `Página *${page}*`)
                .then(result => console.log('Succsses - f sendMenu: ', result))
                .catch(err => console.log('Error - f sendMenu image: ', err))
        }
        client.sendButtons(
            message.from,
            'Quandp estiver pronto,\nclique em *Fazer um pedido* para continuarmos o atendimento',
            createButtons(buttons.buttonsViewMenu),
            botConfig.shortName
        )
            .then(result => client.stopTyping(message.from))
            .catch(err => console.error('Error - f sendMenu buttons: ', err))
    },
    // outras opções de chat - não serão implementadas
    otherOptions(message: Message, client: Whatsapp) {
        seeTyping(client, message.from)
        client.sendButtons(
            message.from,
            'Em que mais eu posso te ajudar?🤔',
            createButtons(buttons.buttonsOtherOptions),
            botConfig.shortName
        )
            .then(result => client.stopTyping(message.from))
            .catch(err => console.log('Erro - f otherOptions: ', err))
    },
    // chamando o bot
    callBot(message: Message, client: Whatsapp) {
        seeTyping(client, message.from)
        client.sendButtons(
            message.from,
            `Ooooiii! Você me chamou!?🧐
            No que eu posso te ajudar?`.replace(/^ /gm, ''),
            createButtons(buttons.buttonsListInit),
            botConfig.shortName
        )
            .then(result => client.stopTyping(message.from))
            .catch(err => console.error('Erro - f callBot: ', err))
    },
    // abrindo ordem
    initOrder(message: Message, client: Whatsapp, addOrder = false) {
        seeTyping(client, message.from)
        // atualizando o estágio onde o cliente se encontra no gerenciamento do atendimento
        if (!addOrder) chatControll.updateDoc(message.chatId, Field.codeState, 'openOrder', false)
        client.sendListMenu(
            message.from,
            botConfig.companyName.toUpperCase(),
            'menu',
            'Clique no botão para abrir o cardápio!',
            'Cardápio'.toUpperCase(),
            createListMenu()
        )
            .then(result => {
                client.stopTyping(message.from)
                // checando resultado do envio da mensagem
                console.log('Resultado: ', result)
            })
            .catch(err => console.error('Erro - f initOrder', err))
    },
    async openOrder(message: Message, client: Whatsapp) {
        seeTyping(client, message.from)
        // regex para validação do item de menu recebido
        const regex = new RegExp(/((^[\w\dà-ú' ]+)R\$(\d+\.\d+))\n([\wà-ú ,\.\(\)\-\+\*]+)$/i)
        // validando item recebido
        let existItem: boolean | undefined
        // validando mensagem recebidat
        if (regex.test(message.body)) {
            // atribuindo valor booleano à variável existeItem
            existItem = false
            // realizando o match no message.body
            const arrayMatch = message.body.match(regex)
            // preenchendo ordem
            let order: TOrder = {
                title: arrayMatch![2].trim(),
                price: parseFloat(arrayMatch![3]),
                description: arrayMatch![4]
            }
            // fazendo a varedura no menu e verificando se o item recebido existe
            for (let i = 0; i < menuList.length; i++) {
                const item = menuList[i]
                for (let j = 0; j < item.rows.length; j++) {
                    const row = item.rows[j]
                    if (order.title === row.title && order.price === row.price && order.description === row.description) {
                        order.category = item.category
                        // certificando que o item existe
                        existItem = true
                        /*  realizando um "push" no array temp orderList no banco
                            salvando item no banco na collection de de controle de chat de forma temporal
                            quando o pedido for finalizado, a ordem será salva na collection order
                            os dados da collection de controle serão apagados para o início de uma nova ordem  */
                        chatControll.updateDoc(message.chatId, Field.tempOrderList, fieldValue.arrayUnion(order), false)
                        break
                    }
                    if (existItem) break
                }
            }
            // verificando se o item existe
            // essa verificação identifica se o item foi clicado ou se o item foi digitado
            if (existItem) {
                // enviar mensagem para o cliente preencher a quantidade
                client.sendButtons(
                    message.from,
                    `Digite agora a quantidade para o produto *${order.title}*\n
                    ⚠ ATENÇÃO ⚠
                    ❱❱❱ DIGITE UM VALOR NUMÉRICO INTEIRO
                    ➥ Ex: 2\n
                    Ou clique no botão e cancele o pedido.`.replace(/^ +/gm, ''),
                    createButtons(buttons.buttonCancell),
                    botConfig.botName
                )
                    .then(result => {
                        client.stopTyping(message.from)
                        /* setando um substágio para o cliente
                           isso significa que enquanto a ordem estiver aberta {checkState: 'openOrder'}
                           iremos gerenciar o pedido do cliete com subestágios
                           o subestágio a seguir é 'quantity' => quantidade
                           portanto iremos validar a quantidade informada pelo cliente  */
                        chatControll.updateDoc(message.chatId, Field.subState, 'validateQuantity', false)
                    })
                    .catch(err => console.log('Erro ao enviar mensagend de solicitação de quantidade\n--f openOrder: ', err))
            }
        }
        // referenciando documeto
        const documentReferemces = await chatControll.getDocumetId(message.chatId)
        // alocando dados
        const documentData : TDataTemp = documentReferemces!.data()
        // setando variável de comandos
        command = documentData[Field.subState] as keyof typeof manageOrder
        // fazendo a varredura nos comandos de ordem
        for (const [key, func] of Object.entries(orderCommands)) {
            if (func(message)) {
                command = key as keyof typeof manageOrder
                break
            }
        }
        // intanciando função no obj menageOrder
        const orderManagement = manageOrder[command]
        // verificando se a referência da função é verdadeira e a executando 
        if (orderManagement) {
            orderManagement(message, client)
        } else {
            // informando ao cliente que o item não existe
            if (existItem === undefined || existItem === false) {
                // informar para o cliente que o item que ele digitou não se encontra nos parâmetros
                // solicitando que o cliente escolha novamente o o item do menu
                client.sendListMenu(
                    message.from,
                    botConfig.companyName.toUpperCase(),
                    'menu',
                    `Então🤨! Esse item que você digitou:
                👉🏼 *(* ${message.body} *)*\n
                *Não existe no cardápio.*\n
                Cique no *botão* para abrir o cadápio e selecione um item:`.replace(/^ +/gm, ''),
                    'cardápio'.toUpperCase(),
                    createListMenu()
                )
                    .then(result => client.stopTyping(message.from))
                    .catch(err => console.log('Erro ao enviar menu - f openOrder: ', err))
            }
        }
    },
    // o cliente informou que a ordem está ok até o momento
    okOrder(message: Message, client: Whatsapp) {
        seeTyping(client, message.from)
        // iniciando cadastro de endereço
        client.sendText(message.from, 'Ótimo😉!\nEntão vamos começão a cadastrar o seu endereço.')
            .then(result => {
                client.sendText(message.from, 'Digite o seu *CEP:*')
                    .then(result => client.stopTyping(message.from))
                    .catch(err => console.log('Erro ao enviar - f okOrder: ', err))
            })
            .catch(err => console.log('Erro ao enviar - f okOrder: ', err))
        // atualizando estágio do cliente para o cadastro de endereço
        chatControll.updateDoc(message.from, Field.codeState, 'registerAddress', false)
        // atualizando subestágio para validar a checar o CEP
        chatControll.updateDoc(message.from, Field.subState, 'checkZipCode', false)
    },
    async registerAddress(message: Message, client: Whatsapp) {
        seeTyping(client, message.from)
        // referenciando documeto
        const documentReferemces = await chatControll.getDocumetId(message.chatId)
        // alocando dados
        const documentData : TDataTemp = documentReferemces!.data()
        // setando variável de comandos
        command = documentData[Field.subState] as keyof typeof manageAddress
        // instanciando função
        const addressManagement = manageAddress[command]
        // verificando se a referencia da função é verdadeira
        if (addressManagement) {
            addressManagement(message, client)
        }
    },
    async orderEnd(message: Message, client: Whatsapp) {
        seeTyping(client, message.from)
        // recuperando os dados tempotais de chatControll
        const documentData = await chatControll.getDocumetId(message.chatId)
        const tempData: TDataTemp = documentData!.data()
        // atulalizando collection customer com os dados do endereço
        customerControll.updateDoc(message.chatId, 'address', tempData.tempAddress)
        // inserindo dados do podido na collection order
        const data = {
            idCustomer: message.chatId,
            orderList: tempData.tempOrderList
        }
        const idOrder = await orderControll.insertDoc(data)
        console.log('idOrder: ', idOrder)
        // comunicando o cliente que seu pedido foi anotado e será entregue no endereço informado
        client.sendText(
            message.from,
            `Beleza! O seu pedido foi anotado e enviado para a produçao.\n
            Obrigado pela preferência! 😁\n
            Para me chamar novamente é só digitar *${botConfig.shortName}*! 😉`.replace(/^ +/gm, '')
        )
            .then(result => client.stopTyping(message.from))
            .catch(err => console.log('Erro ao enviar - orderEnd: ', err))
        // resetando dados temporários e reiniciando estágio e subsetágio do cliente em chat controll
        const resettingFields: TDataTemp = {
            codeState: '',
            subState: fieldValue.delete(),
            tempAddress: fieldValue.delete(),
            tempOrderList: fieldValue.delete()
        }
        chatControll.updateManyFields(message.chatId, resettingFields)
    },
    cancelOrder(message: Message, client: Whatsapp) {
        seeTyping(client, message.from)
        const resettingFields: TDataTemp = {
            codeState: '',
            subState: fieldValue.delete(),
            tempAddress: fieldValue.delete(),
            tempOrderList: fieldValue.delete()
        }
        chatControll.updateManyFields(message.chatId, resettingFields)
        client.sendText(
            message.from,
            `Entendi! O seu pedido foi cancelado com sucesso.\n
            Até a proxima! 😁\n
            Para me chamar novamente é só digitar *${botConfig.shortName}*! 😉`.replace(/^ +/gm, '')
        )
            .then(result => client.stopTyping(message.from))
            .catch(err => console.log('Erro ao enviar - orderEnd: ', err))
    }
}

// exportando como namespaces
export { manageChat }