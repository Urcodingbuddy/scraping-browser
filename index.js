import express from 'express';
import cors from 'cors'
import { scrapeProduct } from './api/scraper.js';
import { dummy } from './dummy.js';
const app = express();
const PORT = process.env.PORT || 3001;
app.use(cors());
app.use(express.json());
app.get('/', (req, res) => {
    res.status(200).json({
        status: 'ok',
        message: 'Product scraper API is running',
        endpoints: {
            scrape: '/api/scrape?query=product+name'
        }
    });
});

app.get('/api/dummy', (req, res) => {
    try {
        const { query } = req.query;
        if (!query) {
            return res.status(400).json({
                error: 'Missing query parameter',
                example: '/api/scrape?query=iphone%2015%20pro'
            });
        }
        const dummyData = dummy();
        res.status(200).json(dummyData);
    } catch (error) {
        throw new error("Somthing went wrong")
    }
});

app.get('/api/scrape', async (req, res) => {
    try {
        const { query } = req.query;
        if (!query) {
            return res.status(400).json({
                error: 'Missing query parameter',
                example: '/api/scrape?query=iphone%2015%20pro'
            });
        }
        console.log(`Received scraping request for: ${query}`);
        const results = await scrapeProduct(query);
        if (!results) {
            return res.status(404).json({ error: 'No results found' });
        }
        res.status(200).json(results);
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({
            error: 'An error occurred while scraping',
            message: error.message
        });
    }
})

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});