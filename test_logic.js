const links = [
    { href: "/p/t-shirts-sweaters-hoodies-collections/sarcastic-qoutes-t-shirts" },
    { href: "/t-shirts-sweaters-hoodies-collections/sarcastic-qoutes-t-shirts" },
    { href: "https://theoldgrumpyclub.com/p/t-shirts-sweaters-hoodies-collections/sarcastic-qoutes-t-shirts" }
];

const currentPaths = [
    "/p/t-shirts-sweaters-hoodies-collections",
    "/t-shirts-sweaters-hoodies-collections",
    "/p/t-shirts-sweaters-hoodies-collections/"
];

currentPaths.forEach(currentPath => {
    console.log(`\nTesting currentPath: ${currentPath}`);
    links.forEach(link => {
        const linkUrlObj = new URL(link.href, 'https://theoldgrumpyclub.com');
        const normalize = (p) => p.replace(/^\/p\//, '/').replace(/\/$/, '');
        
        const normalizedCurrent = normalize(currentPath);
        const normalizedLink = normalize(linkUrlObj.pathname);
        
        const startsWith = normalizedLink.startsWith(normalizedCurrent + '/');
        const lengthOk = normalizedLink.length > normalizedCurrent.length + 1;
        const remainingPath = normalizedLink.substring(normalizedCurrent.length + 1);
        const includesSlash = remainingPath.includes('/');
        
        const isValid = startsWith && lengthOk && !includesSlash;
        
        console.log(`  href: ${link.href}`);
        console.log(`  -> isValid: ${isValid}`);
        if (!isValid) {
            console.log(`     startsWith: ${startsWith}, lengthOk: ${lengthOk}, includesSlash: ${includesSlash}`);
            console.log(`     normalizedCurrent: ${normalizedCurrent}`);
            console.log(`     normalizedLink: ${normalizedLink}`);
            console.log(`     remainingPath: ${remainingPath}`);
        }
    });
});
