const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

exports.getYieldData = (req, res, next) => {
    try {
        let { state, metric, season } = req.query;
        state = state || 'Madhya Pradesh';
        metric = metric || 'Yield'; // Area, Production, Yield
        season = season || 'Total';

        // Mapping to filenames
        let filenamePrefix = 'All-India';
        if (state.toLowerCase() === 'madhya pradesh') {
            filenamePrefix = 'Madhya-Pradesh';
        }

        let metricCap = 'Yield';
        if (metric.toLowerCase() === 'area') metricCap = 'Area';
        if (metric.toLowerCase() === 'production') metricCap = 'Production';

        const filename = `${filenamePrefix}-${metricCap}.csv`;
        const filePath = path.join(__dirname, '../../data', filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, error: 'Data not found for this metric/state' });
        }

        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const records = parse(fileContent, {
            columns: true,
            skip_empty_lines: true,
            bom: true
        });

        // Filter by season
        const filteredRecords = records.filter(row => row.Season.toLowerCase() === season.toLowerCase());

        // Extract labels (years)
        const allKeys = Object.keys(records[0] || {});
        const yearKeys = allKeys.filter(k => k.startsWith(`${metricCap}-`));
        const labels = yearKeys.map(k => k.replace(`${metricCap}-`, ''));

        const crops = [];
        const datasets = [];

        filteredRecords.forEach(row => {
            crops.push(row.Crop);
            const data = yearKeys.map(k => {
                const val = parseFloat(row[k]);
                return isNaN(val) ? null : val;
            });
            datasets.push({
                crop: row.Crop,
                data
            });
        });

        res.json({
            success: true,
            data: {
                labels,
                crops,
                datasets,
                metric: metricCap,
                state: filenamePrefix.replace('-', ' ')
            }
        });
    } catch (error) {
        next(error);
    }
};
