import prisma from "../lib/prisma"

export const resolvers = {
  Query: {

    products: async () => {

      return prisma.product.findMany({

        include: {

          category: true
        }
      })
    },

    productsByCategory: async (

      _: unknown,

      {
        categoryName

      }: {

        categoryName: string
      }

    ) => {

      return prisma.product.findMany({

        where: {

          category: {

            name: categoryName
          }
        },

        include: {

          category: true
        }
      })
    },

    lowStockProducts: async () => {

      const products =
        await prisma.product.findMany({

          where: {

            quantity: {

              lte: 3
            }
          }
        })

      if (products.length === 0) {

        return `
✅ No low stock products
`
      }

      const stockMessage =

        products.map(

          (p) =>

            `${p.name} → ${p.quantity} left`

        ).join("\n\n")

      return `

⚠️ LOW STOCK PRODUCTS

${stockMessage}
`
    },

    profitReport: async () => {

      const bills =
        await prisma.bill.findMany()

      const expenses =
        await prisma.expense.findMany()

      let revenue = 0

      let totalExpenses = 0

      for (const bill of bills) {

        revenue += bill.totalAmount
      }

      for (const expense of expenses) {

        totalExpenses += expense.amount
      }

      const profit =
        revenue - totalExpenses

      return `

💰 PROFIT REPORT

Revenue: ₹${revenue}

Expenses: ₹${totalExpenses}

Profit: ₹${profit}
`
    },

    topProducts: async () => {      const products = await prisma.product.findMany({
        orderBy: { soldCount: "desc" },
        take: 5
      })

      if (products.length === 0) {
        return "❌ No sales data yet"
      }

      const list = products
        .map((p, i) => `${i + 1}. ${p.name} - ${p.soldCount} sold`)
        .join("\n")

      return `🏆 TOP SELLING PRODUCTS\n\n${list}`
    },

    pendingPayments: async () => {
      const pending = await prisma.bill.findMany({
        where: { isPaid: false },
        orderBy: { createdAt: "desc" }
      })

      if (pending.length === 0) {
        return "✅ No pending payments"
      }

      const list = pending
        .map((b, i) =>
          `${i + 1}. ${b.customerName || "Unknown"}\n   Amount: ₹${b.totalAmount}\n   ID: #${b.id}\n   Date: ${b.createdAt.toLocaleDateString("en-IN")}`
        )
        .join("\n\n")

      const total = pending.reduce((sum, b) => sum + b.totalAmount, 0)

      return `💳 PENDING PAYMENTS\n\n${list}\n\n─────────────\nTotal Pending: ₹${total}`
    },

    closingReport: async () => {
      const bills = await prisma.bill.findMany()
      const expenses = await prisma.expense.findMany()

      const lowStock = await prisma.product.count({
        where: { quantity: { lte: 3 } }
      })

      const billCount = await prisma.bill.count()

      let revenue = 0
      let totalExpenses = 0

      for (const bill of bills) revenue += bill.totalAmount
      for (const expense of expenses) totalExpenses += expense.amount

      const profit = revenue - totalExpenses

      return `📊 TODAY REPORT\n\nSales: ₹${revenue}\nExpenses: ₹${totalExpenses}\nProfit: ₹${profit}\nBills Generated: ${billCount}\nLow Stock Products: ${lowStock}`
    },

    salesReport: async () => {

      const bills =
        await prisma.bill.findMany()

      let cash = 0

      let upi = 0

      let card = 0

      let total = 0

      for (const bill of bills) {

        total += bill.totalAmount

        if (
          bill.paymentType.toLowerCase()
          === "cash"
        ) {

          cash += bill.totalAmount
        }

        else if (
          bill.paymentType.toLowerCase()
          === "upi"
        ) {

          upi += bill.totalAmount
        }

        else if (
          bill.paymentType.toLowerCase()
          === "card"
        ) {

          card += bill.totalAmount
        }
      }

      return `

💰 SALES REPORT

Cash: ₹${cash}

UPI: ₹${upi}

Card: ₹${card}

TOTAL: ₹${total}
`
    }
  },
  Mutation: {

    addCategory: async (_: unknown, { name }: { name: string }) => {
      return prisma.category.create({
        data: {
          name
        }
      })
    },
    addProduct: async (_: unknown, { name, price, quantity, categoryName, packaging }: { name: string, price: number, quantity: number, categoryName?: string, packaging?:string }) => {

      let categoryId: number | undefined = undefined

      if (categoryName) {
        const category = await prisma.category.findFirst({
          where: { name: categoryName }
        })
        if (!category) {
          throw new Error("Category not found")
        }
        categoryId = category.id
      }

      return prisma.product.upsert({
        where: { name },
        update: { price, quantity,packaging },
        create: {
          name,
          price,
          quantity,
          packaging,
          ...(categoryId ? { categoryId } : {})
        }
      })
    },

    addExpense: async (_: unknown, { title, amount }: { title: string, amount: number }) => {
      return prisma.expense.create({
        data: {
          title,
          amount
        }
      })
    },

    restockProduct: async(_:unknown,{name,quantity}:{name:string, quantity:number})=>{
        const product = await prisma.product.findFirst({
           where : {
              name
           }
        })

        if(!product){
          throw new Error("Product not found")
        }

        return prisma.product.update({
          where:{
            id:product.id
          },
          data:{
            quantity:{
              increment: quantity
            }
          }
        })
    },

   multiBill: async (

  _: unknown,

  {
    items,
    paymentType,
    discount = 0,
    format = "detailed",
    customerName

  }: {

    items: string
    paymentType: string
    discount?: number
    format?: string
    customerName?: string
  }

) => {

  const parsedItems =
    JSON.parse(items)

  let total = 0

  let billText = ""

  for (const item of parsedItems) {

    const product =
      await prisma.product.findFirst({

        where: {

          name: item.name
        }
      })

    if (!product) {

      throw new Error(

        `${item.name} not found`
      )
    }

    if (
      product.quantity <
      item.quantity
    ) {

      throw new Error(

        `${item.name} insufficient stock`
      )
    }

    const itemTotal =
      product.price *
      item.quantity

    total += itemTotal

    billText += `

${product.name}

Qty: ${item.quantity}

Price: ₹${product.price}

Total: ₹${itemTotal}

----------------`
    
    await prisma.product.update({

      where: {

        id: product.id
      },

      data: {

        quantity: {

          decrement:
            item.quantity
        },

        soldCount: {

          increment:
            item.quantity
        }
      }
    })
  }

  const discountAmount =
    (total * discount) / 100

  const finalAmount =
    total - discountAmount

  await prisma.bill.create({

    data: {

      totalAmount:
        finalAmount,

      paymentType,

      discount,

      customerName: customerName || null,

      isPaid: paymentType.toLowerCase() !== "credit"
    }
  })

  const detailedBill = `

🧾 DETAILED BILL

${billText}

Subtotal: ₹${total}

Discount: ${discount}%

Discount Amount: ₹${discountAmount}

Final Amount: ₹${finalAmount}

Payment: ${paymentType.toUpperCase()}
`

  const fullBill = `

🏪 STOCK MANAGEMENT SYSTEM

🧾 INVOICE

Date: ${new Date().toLocaleDateString()}

================================

${billText}

================================

Subtotal: ₹${total}

Discount: ${discount}%

Discount Amount: ₹${discountAmount}

Final Amount: ₹${finalAmount}

Payment: ${paymentType.toUpperCase()}

Thank You For Shopping 🙏
`

  if (format === "full") {

    return fullBill
  }

  return detailedBill
},

    markPaid: async (_: unknown, { billId }: { billId: number }) => {
      const bill = await prisma.bill.findUnique({ where: { id: billId } })
      if (!bill) throw new Error("Bill not found")
      if (bill.isPaid) return "✅ Already marked as paid"

      await prisma.bill.update({
        where: { id: billId },
        data: { isPaid: true, paymentType: "cash" }
      })

      return `✅ Payment received!\nCustomer: ${bill.customerName || "Unknown"}\nAmount: ₹${bill.totalAmount}`
    },

    billProduct: async (
      _: unknown,
      { name, quantity }: { name: string; quantity: number }
    ) => {
      const product = await prisma.product.findFirst({
        where: { name }
      })

      if (!product) {
        throw new Error("Product not found")
      }

      if (product.quantity < quantity) {
        throw new Error("Insufficient stock")
      }

      return prisma.product.update({
        where: { id: product.id },
        data: { quantity: { decrement: quantity }, soldCount: { increment:quantity } }
      })
    }
  }
}
