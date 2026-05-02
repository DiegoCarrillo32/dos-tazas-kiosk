"use client";

import { useState } from "react";
import { Coffee, Plus, Minus, Trash2, Send } from "lucide-react";

// Mock data
const CATEGORIES = [
  { id: "1", name: "Hot Coffee" },
  { id: "2", name: "Iced Coffee" },
  { id: "3", name: "Pastries" },
];

const MOCK_PRODUCTS = [
  { id: "1", categoryId: "1", name: "Espresso", price: 2.50 },
  { id: "2", categoryId: "1", name: "Americano", price: 3.00 },
  { id: "3", categoryId: "1", name: "Latte", price: 4.50 },
  { id: "4", categoryId: "1", name: "Cappuccino", price: 4.50 },
  { id: "5", categoryId: "2", name: "Iced Latte", price: 5.00 },
  { id: "6", categoryId: "2", name: "Cold Brew", price: 4.50 },
  { id: "7", categoryId: "3", name: "Croissant", price: 3.50 },
  { id: "8", categoryId: "3", name: "Chocolate Chip Cookie", price: 2.50 },
];

type OrderItem = {
  id: string; // unique ID for the cart item
  productId: string;
  name: string;
  price: number;
  quantity: number;
  modifiers: any[]; // To be implemented
};

export default function FloorView() {
  const [activeCategory, setActiveCategory] = useState("1");
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [isSending, setIsSending] = useState(false);

  const filteredProducts = MOCK_PRODUCTS.filter((p) => p.categoryId === activeCategory);

  const total = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const addToOrder = (product: typeof MOCK_PRODUCTS[0]) => {
    // In a real app, clicking might open a modifier modal first
    const newItem: OrderItem = {
      id: Math.random().toString(36).substr(2, 9),
      productId: product.id,
      name: product.name,
      price: product.price,
      quantity: 1,
      modifiers: [],
    };
    setOrderItems([...orderItems, newItem]);
  };

  const updateQuantity = (id: string, delta: number) => {
    setOrderItems((items) =>
      items.map((item) => {
        if (item.id === id) {
          const newQty = item.quantity + delta;
          return { ...item, quantity: newQty > 0 ? newQty : 1 };
        }
        return item;
      })
    );
  };

  const removeItem = (id: string) => {
    setOrderItems((items) => items.filter((item) => item.id !== id));
  };

  const handleSendToCounter = async () => {
    if (orderItems.length === 0) return;
    setIsSending(true);
    
    // TODO: Insert into Supabase `orders` table as 'parked'
    // For now, simulate network request
    await new Promise((resolve) => setTimeout(resolve, 800));
    
    setOrderItems([]);
    setIsSending(false);
    alert("Order sent to counter!");
  };

  return (
    <div className="flex flex-col lg:flex-row h-full">
      {/* Left Area: Categories & Products */}
      <div className="flex-1 flex flex-col h-[60vh] lg:h-full border-b lg:border-b-0 lg:border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
        
        {/* Categories Horizontal Scroll */}
        <div className="flex overflow-x-auto p-4 gap-2 border-b border-zinc-200 dark:border-zinc-800 hide-scrollbar shrink-0">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-6 py-3 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                activeCategory === cat.id
                  ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900 shadow-sm"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Products Grid */}
        <div className="flex-1 overflow-y-auto p-4 bg-zinc-50 dark:bg-zinc-950">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredProducts.map((product) => (
              <button
                key={product.id}
                onClick={() => addToOrder(product)}
                className="aspect-square bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 flex flex-col items-center justify-center gap-3 hover:border-zinc-400 dark:hover:border-zinc-600 hover:shadow-md transition-all active:scale-95"
              >
                <div className="bg-zinc-100 dark:bg-zinc-800 p-3 rounded-full">
                  <Coffee className="w-8 h-8 text-zinc-400 dark:text-zinc-500" />
                </div>
                <div className="text-center">
                  <h3 className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 leading-tight">
                    {product.name}
                  </h3>
                  <p className="text-xs text-zinc-500 mt-1">${product.price.toFixed(2)}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right Area: Current Order */}
      <div className="w-full lg:w-[400px] flex flex-col bg-white dark:bg-zinc-900 h-[40vh] lg:h-full shrink-0">
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          <h2 className="font-bold text-lg text-zinc-900 dark:text-zinc-50">Current Order</h2>
        </div>

        {/* Order Items List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-zinc-50/50 dark:bg-zinc-950/50">
          {orderItems.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-zinc-400 space-y-2">
              <Coffee className="w-12 h-12 opacity-20" />
              <p className="text-sm">No items in the order yet.</p>
            </div>
          ) : (
            orderItems.map((item) => (
              <div key={item.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 flex flex-col gap-3 shadow-sm">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-medium text-zinc-900 dark:text-zinc-100">{item.name}</h4>
                    <p className="text-sm text-zinc-500">${item.price.toFixed(2)} each</p>
                  </div>
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                    ${(item.price * item.quantity).toFixed(2)}
                  </span>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 bg-zinc-100 dark:bg-zinc-800 rounded-md p-1">
                    <button
                      onClick={() => updateQuantity(item.id, -1)}
                      className="p-1 hover:bg-white dark:hover:bg-zinc-700 rounded text-zinc-600 dark:text-zinc-300 transition-colors"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="w-6 text-center font-medium text-sm">{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item.id, 1)}
                      className="p-1 hover:bg-white dark:hover:bg-zinc-700 rounded text-zinc-600 dark:text-zinc-300 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <button
                    onClick={() => removeItem(item.id)}
                    className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950 rounded-md transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Order Summary & Actions */}
        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shrink-0">
          <div className="flex justify-between items-center mb-4">
            <span className="text-zinc-500 dark:text-zinc-400 font-medium">Total</span>
            <span className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
              ${total.toFixed(2)}
            </span>
          </div>
          <button
            onClick={handleSendToCounter}
            disabled={orderItems.length === 0 || isSending}
            className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white py-4 rounded-xl font-bold text-lg transition-colors shadow-sm disabled:opacity-50 disabled:hover:bg-green-600 active:scale-[0.98]"
          >
            {isSending ? (
              "Sending..."
            ) : (
              <>
                <Send className="w-5 h-5" />
                Send to Counter
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
