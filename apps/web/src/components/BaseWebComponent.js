class BaseWebComponent extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        this.render();
        this.setupListeners();
    }

    disconnectedCallback() {
        this.removeListeners();
    }

    static get observedAttributes() {
        return [];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue !== newValue) {
            this.render();
        }
    }

    render() {
        this.shadowRoot.innerHTML = `
      <style>
        ${this.getStyles()}
      </style>
      ${this.getTemplate()}
    `;
    }

    getStyles() {
        return '';
    }

    getTemplate() {
        return '';
    }

    setupListeners() { }
    removeListeners() { }
}

export default BaseWebComponent;
