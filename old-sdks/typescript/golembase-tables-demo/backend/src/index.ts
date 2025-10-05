import express from 'express';
import cors from 'cors';
import { doSQL } from "@freckleface/golembase-tables";

const app = express();
const port = 3000;

app.use(express.json());

const corsOptions = {
  origin: 'http://localhost:4200' 
};
app.use(cors(corsOptions));

app.get('/', (req, res) => {
    res.send('Hello from Golem-base!');
});

app.post('/api/dosql', async (req, res) => {
    const { appName, sql } = req.body; // Destructure the properties
    const result: any = await doSQL(appName, sql);
    res.send(result);
});

// Start server
app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});

