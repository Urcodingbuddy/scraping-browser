import puppeteer from 'puppeteer-core';
import dotenv from "dotenv";
import chromium from '@sparticuz/chromium';
chromium.setGraphicsMode = false;
dotenv.config();

const DEFAULT_NAVIGATION_TIMEOUT = 30000;
const MAX_RETRIES = 2;

export async function scrapeProduct(searchParams) {
    if (!searchParams) return;
    console.log("Scraping Amazon and Flipkart for:", searchParams);
    try {
        const amazonDataPromise = retryOpration(()=>scrapeAmazon(searchParams), MAX_RETRIES)
        const flipkartDataPromise = retryOpration(()=>scrapeFlipkart(searchParams), MAX_RETRIES)
        
        const [amazonData, flipkartData] = await Promise.allSettled([
            amazonDataPromise,
            flipkartDataPromise
        ]);

        const amazonResults = amazonData.status === 'fulfilled' ? amazonData.value : [];
        const flipkartResults = flipkartData.status === 'fulfilled' ? flipkartData.value : [];
        
        console.log("Amazon results count:", amazonResults.length);
        console.log("Flipkart results count:", flipkartResults.length);
        console.log("Scraping End");
        console.log(amazonData, flipkartData)

        return {
            amazon: amazonData || [],
            flipkart: flipkartData || [],
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        console.error("Error in scrapeProduct:", error);
        return {
            amazon: [],
            flipkart: [],
            timestamp: new Date().toISOString(),
            error: error.message
        };
    }
}

async function retryOpration(operation, maxRetries) {
    let lastError;
    for(let attempt = 0; attempt < maxRetries; attempt++){
        try{
            return await operation();
        }catch(error){
            console.log(`Attempt ${attempt+1} failed with error: ${error.message}`);
            lastError = error;
            await new Promise(resolve=> setTimeout(resolve, 1000 * Math.pow(2, attempt)))
        }
    }
    console.log(`All ${maxRetries} attempts failed`);
    throw lastError;
}

async function launchBrowser() {
    return await puppeteer.launch({
        args: [...chromium.args,
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-accelerated-2d-canvas",
            "--no-first-run",
            "--no-zygote",
            "--disable-gpu",
            "--disable-web-security",
            "--disable-features=IsolateOrigins,site-per-process",
            "--blink-settings=imagesEnabled=false"  
        ],
        executablePath: process.env.CHROME_EXECUTABLE_PATH || await chromium.executablePath(),
        headless: chromium.headless,
        defaultViewport: chromium.defaultViewport,
    });
}
// return browser;


async function scrapeAmazon(searchParams) {
    let browser;
    try {
        browser = await launchBrowser();
        const page = await browser.newPage();

        page.setDefaultNavigationTimeout(DEFAULT_NAVIGATION_TIMEOUT);

        await Promise.all([
            page.setRequestInterception(true),
            page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'),
            page.setCacheEnabled(true)
        ])

        page.on("request", (req) => {
            if (["stylesheet", "font", "other", "images"].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });
        const BASE_URL = "https://www.amazon.in/s?k=";
        const amazonUrl = `${BASE_URL}${encodeURIComponent(searchParams.trim().replace(/\s+/g, '+'))}`;
        console.log("Navigating to Amazon...");
        await page.goto(amazonUrl, { 
            waitUntil:[ "domcontentloaded", "networkidle2"],
            timeout: DEFAULT_NAVIGATION_TIMEOUT
        });


        const captchaDetected = await page.evaluate(() => {
            return document.body.textContent.includes("captcha") || 
                   document.body.textContent.includes("robot") ||
                   document.title.includes("Robot");
        });
        
        if (captchaDetected) {
            console.log("Amazon bot detection triggered - attempting bypass");
            await page.reload({ waitUntil: "networkidle2" });
        }


        try {
            await page.waitForSelector(".s-card-container", { timeout: 30000 });
            console.log("Amazon product containers loaded successfully");
        } catch (error) {
            console.log("Timeout or selector not found on Amazon, returning empty results");
            if (process.env.DEBUG) {
                await page.screenshot({ path: 'amazon-error.png' });
                console.log("Debug screenshot saved as amazon-error.png");
            }
            return [];
        }
        const amazonData = await page.evaluate(() => {
            const productSelector = ".s-card-container";
            const nameSelector = ".a-size-medium.a-spacing-none.a-color-base.a-text-normal";
            const ratingSelector = ".a-icon-star-small";
            const reviewsSelector = ".a-size-base.s-underline-text";
            const boughtInPastMonthSelector = ".a-row.a-size-base .a-size-base.a-color-secondary";
            const priceSelector = ".a-price-whole";
            const originalPriceSelector = ".a-offscreen";
            const discountSelector = ".a-size-base.a-color-price";
            const availabilitySelector = ".a-size-medium.a-color-success";
            const imageSelector = ".s-image";

            return Array.from(document.querySelectorAll(productSelector))
                .map(el => {
                    return {
                        name: el.querySelector(nameSelector)?.textContent?.trim() || "N/A",
                        rating: el.querySelector(ratingSelector)?.textContent?.trim() || "N/A",
                        reviews: el.querySelector(reviewsSelector)?.textContent?.trim() || "N/A",
                        boughtInPastMonth: el.querySelector(boughtInPastMonthSelector)?.textContent?.trim() || "N/A",
                        price: el.querySelector(priceSelector)?.textContent?.trim() || "Out of Stock",
                        originalPrice: el.querySelector(originalPriceSelector)?.textContent?.trim() || "N/A",
                        discount: el.querySelector(discountSelector)?.textContent?.trim() || "",
                        availability: el.querySelector(availabilitySelector)?.textContent?.trim() || "In Stock",
                        image: el.querySelector(imageSelector)?.getAttribute("src") || "",
                        link: el.querySelector("a")?.getAttribute("href") ? `https://www.amazon.in${el.querySelector("a")?.getAttribute("href")}` : ""
                    };
                })
                .filter(item => item.name !== "N/A" && item.name.length > 0)
                .slice(0, 10);
        });
        console.log(`Found ${amazonData.length} products on Amazon`);
        await page.close();
        return amazonData;
    } catch (error) {
        console.error('An error occurred with Amazon scraping:', error);
        return [];
    } finally {
        if (browser) await browser.close();
    }
}

async function scrapeFlipkart(searchParams) {
    let browser;
    try {
        browser = await launchBrowser();
        const page = await browser.newPage();
        page.setDefaultNavigationTimeout(DEFAULT_NAVIGATION_TIMEOUT);
        await Promise.all([
            page.setRequestInterception(true),
            page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"),
            page.setCacheEnabled(true)
        ]);
        
        page.on("request", (req) => {
            if (["stylesheet", "font", "other", "images"].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });
        const BASE_URL = "https://www.flipkart.com/search?q=";
        const flipkartUrl = `${BASE_URL}${encodeURIComponent(searchParams.trim().replace(/\s+/g, '+'))}`;
        console.log("Navigating to Flipkart...");
        await page.goto(flipkartUrl, { 
            waitUntil: ["domcontentloaded", "networkidle2"],
            timeout: DEFAULT_NAVIGATION_TIMEOUT
        });
        const isRushPage = await page.evaluate(() => {
            return !!document.querySelector("#retry_btn"); // Retry button exists on "rush page"
        });

        if (isRushPage) {
            console.log("Rush page detected! Waiting and attempting to bypass...");
            try {
                console.log("Clicking 'Try Now' button...");
                await page.locator('button').click();
                console.log("Clicked retry button");
                    await page.waitForNavigation({ 
                        waitUntil: "networkidle2", 
                        timeout: DEFAULT_NAVIGATION_TIMEOUT 
                    });
                    console.log("Navigated past rush page");
            } catch (error) {
                console.log("Failed to click retry button:", error.message);
                await page.reload({ waitUntil: "networkidle2" });
            }
            await page.waitForNavigation({ waitUntil: "networkidle0", timeout: 30000 });
            console.log("Navigated to the actual product page.");
        }
        try {
            await page.waitForSelector("._75nlfW", { timeout: 5000 });
        } catch (error) {
            if (process.env.DEBUG) {
                await page.screenshot({ path: 'flipkart-error.png' });
                console.log("Debug screenshot saved as flipkart-error.png");
            }
            console.log("Timeout or selector not found on Flipkart, returning empty results");
            return [];
        }

        const flipkartData = await page.evaluate(() => {
            const productSelector = "._75nlfW";
            const nameSelector = ".KzDlHZ";
            const priceSelector = ".Nx9bqj._4b5DiR";
            const orignalPriceSelector = ".yRaY8j.ZYYwLA";
            const detailsSelector = ".J+igdf";
            const imageSelector = ".DByuf4";

            const products = Array.from(document.querySelectorAll(productSelector));
            console.log(`Found ${products.length} products with selector ${productSelector}`);

            return Array.from(document.querySelectorAll(productSelector))
                .map(el => {
                    const nameText = el.querySelector(nameSelector)?.textContent?.trim() || "";
                    const detailsText = el.querySelector(detailsSelector)?.textContent?.trim() || "";
                    return {
                        name: nameText || "N/A",
                        price: el.querySelector(priceSelector)?.textContent?.trim() || "N/A",
                        originalPrice: el.querySelector(orignalPriceSelector)?.textContent?.trim() || "N/A",
                        image: el.querySelector(imageSelector)?.getAttribute("src") || "",
                        link: el.querySelector("a")?.getAttribute("href") ? `https://www.flipkart.com${el.querySelector("a")?.getAttribute("href")}` : ""
                    };
                })
                .filter(item => item.name !== "N/A" && item.name.length > 0)
                .slice(0, 10); // Limit to 10 results for faster response
        });
        console.log(`Found ${flipkartData.length} products on Flipkart`);
        await page.close();
        return flipkartData;
    } catch (error) {
        console.error('An error occurred with Flipkart scraping:', error);
        return [];
    } finally {
        if (browser) await browser.close();
    }
}
// Remove this line as we're now exporting the function instead of directly calling it
// scrapeProduct("Realme Gt 6T")