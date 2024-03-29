import { DbConn } from '../../connections/dbConnection'
import { firestore } from 'firebase-admin'

// criando o controller que fará o CRUD
export class AppController {
    constructor(
        public collection: string
    ) { }

    // passando o nome da collection 
    private readonly _db = new DbConn(this.collection).instance.firestore()

    // retornando todos os documentos da collection
    async getAllDocuments(): Promise<firestore.QueryDocumentSnapshot<firestore.DocumentData>[] | null> {
        try {
            const querySnapshots = await this._db.collection(this.collection).get()
            return querySnapshots.docs
        } catch (error) {
            console.log('Erro durante a busca - getAllDocuments: ', error)
            return null
        }
    }

    // retornado documento pelo id
    async getDocumetId(idDoc: string): Promise<firestore.DocumentData | null | undefined> {
        try {
            const documentReference = await this._db.collection(this.collection).doc(idDoc).get()
            return documentReference
        } catch (error) {
            console.log('Erro durante a busca - getDocumetId: ', error)
            return null
        }
    }

    // recuperando documento pelo id com a cláusula where
    async getDocumentIdWhere(
        field: string | firestore.FieldPath,
        opStr: firestore.WhereFilterOp,
        value: any
    ): Promise<firestore.DocumentData | null | undefined> {
        try {
            const documentReference = await this._db.collection(this.collection)
                .where(field, opStr, value)
                .get()
            return documentReference.docs
        } catch (error) {
            console.log('Erro durante a busca - getDocumentIdWhere: ', error)
            return null
        }
    }

    // inserção com id dinâmico
    async insertDoc(data: any): Promise<string> {
        try {
            // adicionando registro temporal no cadastro
            data.createAt = firestore.FieldValue.serverTimestamp()
            // retorna o id do documento gerado de forma dinâmica
            const documentReference = await this._db.collection(this.collection).add(data)
            return documentReference.id
        } catch (error) {
            console.log('Erro ao inserir - insertDoc: ', error)
            return ''
        }
    }

    // inserção com id definido
    insertDocWithId(idDoc: string, data: any, insertDate = true) {
        try {
            // adicionando registro temporal no cadastro
            if (insertDate) {
                data.createAt = firestore.FieldValue.serverTimestamp()
            }
            this._db.collection(this.collection).doc(idDoc).set(data)
                .then(result => console.log('Documento inserido: ', result))
        } catch (error) {
            console.log('Erro ao inserir - insertDocWithId: ', error)
        }
    }

    // atualizar um documento
    async updateDoc(idDoc: string, field: string, fieldValue: any, insertDate = true): Promise<firestore.WriteResult | undefined> {
        try {
            let data = { [field]: fieldValue }
            // adicionando registro temporal no cadastro
            if (insertDate) {
                data.updateAt = firestore.FieldValue.serverTimestamp()
            }
            const writeResult = await this._db.collection(this.collection).doc(idDoc).update(data)
            return writeResult
        } catch (error) {
            console.log('Erro ao atualizar documento - updateDoc: ', error)
        }
    }

    // atualizando vários campos de um vez
    /*  
        esta função não isere no banco o date time da atualização automaticamente.
        você insere nos campos que quer atualizar por ex:

        const manyFields = {
            name: 'seu nome',
            sobreNome: 'seu sobre nome',
            dataAtualizacao: Date.now() || new Date() || firestore.FieldValue.serverTimestamp()
        }
        updateManyFields('seu id', manyFields)   
    */
    async updateManyFields(idDoc: string, manyFields: any): Promise<firestore.WriteResult | undefined> {
        try {
            const writeResult = await this._db.collection(this.collection).doc(idDoc).update(manyFields)
            return writeResult
        } catch (error) {
            console.log('Erro ao atualizar documento - updateManyFields: ', error)
        }
    }

    // deletendo documento
    async deleteDoc(idDoc: string): Promise<firestore.WriteResult | undefined> {
        try {
            const res = await this._db.collection(this.collection).doc(idDoc).delete()
            return res
        } catch (error) {
            console.log('Erro ao deletar documento - deleteDoc: ', error)
        }
    }
}