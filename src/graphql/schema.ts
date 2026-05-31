export const typeDefs = `

  type Category {
    id: ID!
    name: String!
  }

  type Product {
    id: ID!
    name: String!
    price: Float!
    quantity: Int!
    soldCount: Int!
    costPrice: Float!
    category: Category
  }

  type BillItem {   
    id: ID!
    quantity: Int!
    price: Float!
    product: Product
  }

  type Bill {
    id: ID!
    customerName: String
    totalAmount: Float!
    paymentType: String!
    discount: Float!
    isPaid: Boolean!
    createdAt: String!
    items: [BillItem]
  }

  type Expense {
    id: ID!
    title: String!
    amount: Float!
    createdAt: String!
  }

 type Query {

  products: [Product]

  productsByCategory(
    categoryName: String!
  ): [Product]

  bills: [Bill]

  expenses: [Expense]

  salesReport: String

  profitReport: String

  lowStockProducts: String!

  topProducts: String

  closingReport: String

  pendingPayments: String
}
  
  type Mutation {
    addCategory(name: String!): Category

    addProduct(
      name: String!
      price: Float!
      quantity: Int!
      categoryName: String
      packaging:  String
    ): Product

    purchaseProduct(
      name:String!
      quantity: Int!
      costPrice: Float!
    ): Product

    billProduct(
      name: String!
      quantity: Int!
    ): Product

    restockProduct(
      name: String!
      quantity: Int!
    ): Product

    multiBill(
      items: String!
      paymentType: String!
      discount: Float
      customerName: String
      format: String
    ): String

    markPaid(
      billId: Int!
    ): String

    createBill(
      customerName: String
      paymentType: String!
      discount: Float
      items: [BillItemInput!]!
    ): Bill

    addExpense(
      title: String!
      amount: Float!
    ): Expense
  }
  input BillItemInput {
    productId: Int!
    quantity: Int!
    price: Float!
  }
`
