const normalizeCategoryName = (name) => {
    if (!name || typeof name !== "string") return "";
    return name
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
};

module.exports = { normalizeCategoryName };
