import express from "express";
import { MongoClient, ObjectId } from "mongodb";

const app = express();
const port = process.env.PORT || 7000;

// MongoDB connection caching (safe for Vercel serverless)
const mongoUrl = process.env.MONGO_URI;
const databaseName = process.env.DB_NAME || "library_db";

let cachedClient = null;
let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb) return cachedDb;

  if (!mongoUrl) {
    throw new Error("MONGO_URI environment variable is not set");
  }

  const client = new MongoClient(mongoUrl);
  await client.connect();
  cachedClient = client;
  cachedDb = client.db(databaseName);
  console.log("Connected to MongoDB");
  return cachedDb;
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// DB connection middleware — runs before every route
app.use(async (req, res, next) => {
  try {
    req.db = await connectToDatabase();
    next();
  } catch (err) {
    console.error("Database connection failed:", err.message);
    res.status(503).json({ message: "Database unavailable", error: err.message });
  }
});

// Health check - GET /
app.get("/", (req, res) => {
  res.status(200).json({ status: "ok", dbConnected: !!cachedDb });
});

// CRUD API endpoints

// Create a new book - POST /api/v1/books
app.post("/api/v1/books", async (req, res, next) => {
  try {
    const { title, author, category, price } = req.body;
    if (!title || !author || !category || !price) {
      return res.status(400).json({ message: "All book fields are required" });
    }
    const result = await req.db.collection("books").insertOne({ title, author, category, price });
    const newBook = { _id: result.insertedId, title, author, category, price };
    res.status(201).json({ message: "Book created successfully", data: newBook });
  } catch (err) {
    next(err);
  }
});

// Get books by category - GET /api/v1/books?category=categoryName
// Get all books - GET /api/v1/books
app.get("/api/v1/books", async (req, res, next) => {
  try {
    const category = req.query.category;
    const query = category ? { category } : {};
    const books = await req.db.collection("books").find(query).toArray();
    res.status(200).json({ message: "Books fetched successfully", data: books });
  } catch (err) {
    next(err);
  }
});

// Get a single book by ID - GET /api/v1/books/:id
app.get("/api/v1/books/:id", async (req, res, next) => {
  try {
    const bookId = req.params.id;
    const book = await req.db.collection("books").findOne({ _id: new ObjectId(bookId) });
    if (!book) {
      return res.status(404).json({ message: "Book not found" });
    }
    res.status(200).json({ message: "Book fetched successfully", data: book });
  } catch (err) {
    next(err);
  }
});

// Update a book by ID - PUT /api/v1/books/:id
app.put("/api/v1/books/:id", async (req, res, next) => {
  try {
    const bookId = req.params.id;
    const { title, author, category, price } = req.body;
    if (!title || !author || !category || !price) {
      return res.status(400).json({ message: "All book fields are required" });
    }
    const book = { title, author, category, price };
    const result = await req.db.collection("books").updateOne(
      { _id: new ObjectId(bookId) },
      { $set: book }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Book not found" });
    }
    res.status(200).json({ message: "Book updated successfully", data: { _id: new ObjectId(bookId), ...book } });
  } catch (err) {
    next(err);
  }
});

// Delete a book by ID - DELETE /api/v1/books/:id
app.delete("/api/v1/books/:id", async (req, res, next) => {
  try {
    const bookId = req.params.id;
    const result = await req.db.collection("books").deleteOne({ _id: new ObjectId(bookId) });
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "Book not found" });
    }
    res.status(200).json({ message: "Book deleted successfully" });
  } catch (err) {
    next(err);
  }
});

// 404 Not Found middleware
app.use((req, res) => {
  res.status(404).json({ message: "Not Found" });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ message: err.message || "Internal Server Error" });
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

export default app;
