const fs = require('fs');

const collectionPath = './Complete_Postman_Collection.json';
const data = fs.readFileSync(collectionPath, 'utf8');
const collection = JSON.parse(data);

const analyticsFolder = collection.item.find(i => i.name === 'Analytics');

if (analyticsFolder) {
    const newEndpoints = [
        {
            name: "Top Expenses",
            request: {
                method: "GET",
                header: [
                    {
                        key: "Authorization",
                        value: "Bearer {{authToken}}"
                    }
                ],
                url: {
                    raw: "{{baseUrl}}/api/analytics/top-expenses",
                    host: ["{{baseUrl}}"],
                    path: ["api", "analytics", "top-expenses"]
                }
            },
            response: []
        },
        {
            name: "Category Trend",
            request: {
                method: "GET",
                header: [
                    {
                        key: "Authorization",
                        value: "Bearer {{authToken}}"
                    }
                ],
                url: {
                    raw: "{{baseUrl}}/api/analytics/category-trend",
                    host: ["{{baseUrl}}"],
                    path: ["api", "analytics", "category-trend"]
                }
            },
            response: []
        },
        {
            name: "Smart Insights",
            request: {
                method: "GET",
                header: [
                    {
                        key: "Authorization",
                        value: "Bearer {{authToken}}"
                    }
                ],
                url: {
                    raw: "{{baseUrl}}/api/analytics/insights",
                    host: ["{{baseUrl}}"],
                    path: ["api", "analytics", "insights"]
                }
            },
            response: []
        },
        {
            name: "Daily Heatmap",
            request: {
                method: "GET",
                header: [
                    {
                        key: "Authorization",
                        value: "Bearer {{authToken}}"
                    }
                ],
                url: {
                    raw: "{{baseUrl}}/api/analytics/heatmap",
                    host: ["{{baseUrl}}"],
                    path: ["api", "analytics", "heatmap"]
                }
            },
            response: []
        },
        {
            name: "Spending Prediction",
            request: {
                method: "GET",
                header: [
                    {
                        key: "Authorization",
                        value: "Bearer {{authToken}}"
                    }
                ],
                url: {
                    raw: "{{baseUrl}}/api/analytics/prediction",
                    host: ["{{baseUrl}}"],
                    path: ["api", "analytics", "prediction"]
                }
            },
            response: []
        }
    ];

    // Avoid duplicating if script runs multiple times
    newEndpoints.forEach(ep => {
        if (!analyticsFolder.item.find(existing => existing.name === ep.name)) {
            analyticsFolder.item.push(ep);
        }
    });

    fs.writeFileSync(collectionPath, JSON.stringify(collection, null, "\t"));
    console.log("Postman collection updated successfully.");
} else {
    console.log("Analytics folder not found in Postman collection.");
}
