import requests
from bs4 import BeautifulSoup
import urllib.parse
import re

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

def google_search(query: str, num_results: int = 5):
    """
    Perform a Google search and return a list of dicts with title, link, and snippet.
    """
    search_url = f"https://www.google.com/search?q={urllib.parse.quote(query)}"
    try:
        response = requests.get(search_url, headers=HEADERS, timeout=10)
        if response.status_code != 200:
            return [{"error": f"Failed to fetch search results. Status code: {response.status_code}"}]
        
        soup = BeautifulSoup(response.text, "html.parser")
        results = []
        
        # Google search result cards are usually in div.g or div.tF23ub
        search_divs = soup.find_all("div", class_="g")
        for div in search_divs:
            if len(results) >= num_results:
                break
                
            link_elem = div.find("a")
            title_elem = div.find("h3")
            # Snippets are usually in div.VwiC3b or similar
            snippet_elem = div.find("div", class_=re.compile(r"VwiC3b|kb090b|yDty9d|MU14D"))
            
            if link_elem and title_elem:
                link = link_elem.get("href", "")
                title = title_elem.get_text()
                snippet = snippet_elem.get_text() if snippet_elem else ""
                
                # Filter out google internal links
                if link.startswith("/") and "url?q=" in link:
                    parsed = urllib.parse.parse_qs(urllib.parse.urlparse(link).query)
                    link = parsed.get("q", [""])[0]
                
                if link and not link.startswith("/"):
                    results.append({
                        "title": title,
                        "link": link,
                        "snippet": snippet
                    })
                    
        # Fallback if class names changed
        if not results:
            # Search for any standard <a> tags under headers
            for a_tag in soup.find_all("a"):
                if len(results) >= num_results:
                    break
                href = a_tag.get("href", "")
                h3 = a_tag.find("h3")
                if href and h3:
                    link = href
                    if link.startswith("/url?q="):
                        parsed = urllib.parse.parse_qs(urllib.parse.urlparse(link).query)
                        link = parsed.get("q", [""])[0]
                    if link and not link.startswith("/") and "google.com" not in link:
                        results.append({
                            "title": h3.get_text(),
                            "link": link,
                            "snippet": "No preview available"
                        })
                        
        return results
    except Exception as e:
        return [{"error": f"Google search error: {str(e)}"}]

def scrape_page_content(url: str) -> str:
    """
    Fetch the text content of a webpage, clean it, and return it.
    This fulfills the 'scrape without redirecting the user' requirement.
    """
    try:
        response = requests.get(url, headers=HEADERS, timeout=10)
        if response.status_code != 200:
            return f"Failed to retrieve page content. Status: {response.status_code}"
            
        soup = BeautifulSoup(response.text, "html.parser")
        
        # Remove non-content elements
        for element in soup(["script", "style", "nav", "footer", "header", "noscript", "iframe"]):
            element.decompose()
            
        # Get raw text
        text = soup.get_text(separator="\n")
        
        # Clean up whitespace
        lines = (line.strip() for line in text.splitlines())
        chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
        clean_text = "\n".join(chunk for chunk in chunks if chunk)
        
        # Truncate to avoid overloading context window (~8000 words max)
        return clean_text[:30000]
    except Exception as e:
        return f"Error scraping page content from {url}: {str(e)}"
