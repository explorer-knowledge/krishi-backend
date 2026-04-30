const express = require('express');
const router = express.Router();
const { searchPlants, getPlantDetails } = require('../services/perenualService');

router.get('/search', async (req, res, next) => {
    try {
        const q = req.query.q;
        if (!q) return res.status(400).json({ error: 'Missing query parameter q' });
        const data = await searchPlants(q);
        if (!data) return res.status(500).json({ error: 'Failed to fetch plant data' });
        res.json(data);
    } catch (err) {
        next(err);
    }
});

router.get('/:id', async (req, res, next) => {
    try {
        const id = req.params.id;
        const data = await getPlantDetails(id);
        if (!data) return res.status(500).json({ error: 'Failed to fetch plant details' });
        res.json(data);
    } catch (err) {
        next(err);
    }
});

module.exports = router;
