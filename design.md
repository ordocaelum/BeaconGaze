# Design System & Technical Specification: The Cosmic Alignment Blueprint

This document defines the user interface tokens, component architecture, and structural layout for **The Cosmic Alignment Blueprint** web platform, derived directly from the dark-mode cosmic aesthetic mockup.

---

## 1. Design Tokens

### Color Palette

| Token Name | Hex Code | Utility / Usage |
| :--- | :--- | :--- |
| `color-bg-space` | `#080711` | Primary background canvas |
| `color-bg-nebula` | `#131124` | Elevated cards, content blocks, and dropdown fields |
| `color-primary-glow` | `#6344F5` | Neon accents, active state borders, primary buttons |
| `color-text-heading` | `#9B86FF` | Titles, section headers, active menu text |
| `color-text-body` | `#A5A1B8` | Prose paragraphs, neutral descriptions, labels |
| `color-text-white` | `#FFFFFF` | Emphasized metadata, highlighted values |

### Typography
*   **Heading Font:** Futuristic, geometric sans-serif (e.g., *Orbitron*, *Syncopate*, or *Rajdhani*)
    *   `font-weight: 700;`
    *   `letter-spacing: 0.08em;`
    *   `text-transform: uppercase;`
*   **Body Font:** Clean, readable sans-serif or crisp serif mix (e.g., *Inter*, *Plus Jakarta Sans*)
    *   `font-weight: 400;`
    *   `line-height: 1.6;`

### UI Accents & Shadows
*   **Glow Effect:** `box-shadow: 0 0 15px rgba(99, 68, 245, 0.4);`
*   **Dividers:** `border-top: 1px dashed #6344F5; opacity: 0.6;`
*   **Border Radius:** `8px` for subtle modern curves on structural cards.

---

## 2. Component Architecture

### Navigation / Progress Bar
*   **Type:** Linear breadcrumb stepper.
*   **States:**
    *   *Active Step:* Filled neon purple block with white text.
    *   *Inactive Step:* Dark wireframe outline with muted lavender text.

### Media Card (The Archetype Sketch)
*   **Structure:** A double-bordered picture container.
*   **Visual Elements:** Centered vintage sketch illustration wrapped in a thin `#6344F5` glow frame.
*   **Subtext:** Small centered metadata label (`font-size: 0.85rem; font-style: italic;`) immediately below the image.

### Interactive Carousel (Zodiac Selector)
*   **Structure:** Horizontal icon strip flanked by left (`<`) and right (`>`) arrow triggers.
*   **Interaction:** Selecting an icon reveals a bright purple border active indicator highlight.

### Information Dashboard Card
*   **Structure:** Container block filled with `color-bg-nebula`.
*   **Data Layout:** Two-column key-value format. Left column handles functional icons and descriptors (Muted Violet). Right column renders the dynamic bold values (White).
*   **Action Row:** Integration field showcasing a scannable code layout (e.g., Activation Pass barcode / text block).

### Call to Action (CTA)
*   **Type:** Full-width sticky bottom anchor button.
*   **Aesthetic:** Solid vibrant violet gradient background, bold white capitalized typography.

---

## 3. Page Layout Wireframe (Top to Bottom)

1.  **Viewport Container:** Full height `min-height: 100vh;` utilizing an optional CSS gradient starfield background overlay.
2.  **Hero Heading Block:**
    *   H1: Title (Centered)
    *   Paragraph: Prose Intro (Centered, max-width bounded to 650px for readability)
3.  **Step Navigation Panel** (Centered)
4.  **Section 1 Header & Body Copy**
5.  **Archetype Portrait Card Component**
6.  **Zodiac Carousel Slider**
7.  **Section 2 Header & Sub-label Copy**
8.  **Physical Coordinates Dashboard Component**
9.  **Footer Signature:** Muted reminder subtext text block.
10. **Fixed Footer CTA Button**

---

## 4. Markdown HTML Structure Guide

```html
<main class="cosmic-canvas">
  
  <!-- Header -->
  <header class="hero-section">
    <h1>The Cosmic Alignment Blueprint</h1>
    <p class="intro-text">In the celestial dance of the cosmos...</p>
  </header>

  <!-- Progress -->
  <nav class="stepper-nav">...</nav>

  <!-- Section 1 -->
  <section class="archetype-section">
    <h2>1. Your Soulmate Archetype Sketch</h2>
    <p>Her soulmate's energetic blueprint embodies...</p>
    
    <div class="sketch-card">
      <img src="sketch.jpg" alt="Soulmate Sketch">
      <span class="caption">Intuitive & Nurturing - Energetic Blueprint</span>
    </div>
    
    <div class="zodiac-carousel">...</div>
  </section>

  <!-- Section 2 -->
  <section class="coordinate-section">
    <h2>2. The Physical Meeting Coordinate</h2>
    
    <div class="dashboard-card">
      <div class="data-row"><strong>Designated Venue:</strong> IBIZA SLC Ultra lounge</div>
      <div class="data-row"><strong>Physical Address:</strong> 180 W 400 S, Salt Lake City, UT 84101, USA</div>
      <div class="data-row activation"><strong>Activation Pass:</strong> [Barcode]</div>
    </div>
  </section>

  <!-- Footer Footer -->
  <footer>
    <p class="disclaimer">Keep your eyes open. Do not close yourself off to unexpected connections.</p>
    <button class="cta-primary">Begin Your Alignment Journey</button>
  </footer>

</main>
```
