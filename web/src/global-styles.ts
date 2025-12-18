import { css } from 'lit';

export const globalStyles = css`
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

    body {
        font-family: 'Courier New', Courier, monospace;
        font-size: 17px;
        background: #fff;
        color: #000;
        line-height: 1.4;
    }

    /* Layout Structure */
    .app-container {
        display: flex;
        min-height: 100vh;
    }

    /* Sidebar */
    .sidebar {
        width: 200px;
        background: #000;
        color: #fff;
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
    }

    .sidebar-header {
        height: 64px;
        display: flex;
        align-items: center;
        padding: 0 12px;
        border-bottom: 1px solid #333;
        background: #fff;
    }

    .sidebar-header .logo {
        max-height: 40px;
        max-width: 100%;
        object-fit: contain;
    }

    .sidebar-nav {
        flex: 1;
        padding: 16px 0;
    }

    .nav-item {
        padding: 12px 16px;
        cursor: pointer;
        border-left: 3px solid transparent;
        transition: background 0.1s;
    }
    
    .nav-item a {
        color: #fff;
    }

    .nav-item:hover {
        background: #222;
    }

    .nav-item.active {
        background: #222;
        border-left-color: #fff;
    }

    .nav-item.hidden {
        display: none;
    }

    .nav-divider {
        height: 1px;
        background: #333;
        margin: 8px 16px;
    }

    /* Main Content Area */
    .main-area {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-width: 0;
    }

    /* Top Header */
    .top-header {
        height: 64px;
        background: #fff;
        border-bottom: 1px solid #000;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 24px;
        flex-shrink: 0;
    }

    .header-title {
        font-size: 19px;
        font-weight: bold;
    }

    .header-right {
        display: flex;
        align-items: center;
        gap: 16px;
    }

    .user-info {
        font-size: 13px;
    }

    /* Content Area */
    .content {
        flex: 1;
        padding: 24px;
        overflow-y: auto;
        background: #fafafa;
    }

    .content-inner {
        max-width: 1400px;
        margin: 0 auto;
    }

    /* Page sections */
    .page {
        display: none;
    }

    .page.active {
        display: block;
    }

    /* Tiles / Cards */
    .tiles-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 16px;
        margin-bottom: 24px;
    }

    .tile {
        background: #fff;
        border: 1px solid #000;
        padding: 16px;
        min-height: 100px;
    }

    .tile-label {
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: #666;
        margin-bottom: 8px;
    }

    .tile-value {
        font-size: 34px;
        font-weight: bold;
    }

    .tile-subtitle {
        font-size: 13px;
        color: #666;
        margin-top: 4px;
    }

    .tile-clickable {
        cursor: pointer;
    }

    .tile-clickable:hover {
        background: #f5f5f5;
    }

    /* Section Headers */
    .section-header {
        font-size: 17px;
        font-weight: bold;
        margin-bottom: 16px;
        padding-bottom: 8px;
        border-bottom: 1px solid #ccc;
    }

    /* Tables */
    table {
        width: 100%;
        border-collapse: collapse;
        background: #fff;
        font-size: 16px;
    }

    th, td {
        border: 1px solid #ccc;
        padding: 8px;
        text-align: left;
        vertical-align: top;
    }

    th {
        background: #f0f0f0;
        font-weight: bold;
        text-transform: uppercase;
        font-size: 13px;
        letter-spacing: 0.5px;
    }

    tr:hover {
        background: #fafafa;
    }

    .table-container {
        background: #fff;
        border: 1px solid #000;
        overflow-x: auto;
    }

    .table-container table {
        border: none;
    }

    .table-container th:first-child,
    .table-container td:first-child {
        border-left: none;
    }

    .table-container th:last-child,
    .table-container td:last-child {
        border-right: none;
    }

    .table-container tr:first-child th {
        border-top: none;
    }

    .table-container tr:last-child td {
        border-bottom: none;
    }

    /* Buttons */
    button[disabled] {
        color: rgb(190,190,190);
        border-color: #777;
        pointer-events: none;
    }
    
    .btn {
        font-family: 'Courier New', Courier, monospace;
        font-size: 14px;
        padding: 8px 14px;
        border: 1px solid #000;
        background: #fff;
        cursor: pointer;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .btn:hover {
        background: #f0f0f0;
    }

    .btn-primary {
        background: #000;
        color: #fff;
    }

    .btn-primary:hover {
        background: #333;
    }

    .btn-danger {
        background: #c00;
        color: #fff;
        border-color: #c00;
    }

    .btn-danger:hover {
        background: #900;
    }

    .btn-sm {
        padding: 5px 10px;
        font-size: 13px;
    }

    .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .processing {
        position: relative;
        pointer-events: none;
        background-color: #444;
        border-color: #bbb !important;
    }

    .processing::after {
        content: "";
        position: absolute;
        top: 50%;
        left: 50%;
        width: 1em;
        height: 1em;
        border: 2px solid white;
        border-radius: 50%;
        border-top-color: transparent;
        animation: spin 0.8s linear infinite;
        transform: translate(-50%, -50%);
    }

    @keyframes spin {
        from { transform: translate(-50%, -50%) rotate(0deg); }
        to { transform: translate(-50%, -50%) rotate(360deg); }
    }

    /* Forms */
    input, select, textarea {
        font-family: 'Courier New', Courier, monospace;
        font-size: 16px;
        padding: 8px 10px;
        border: 1px solid #000;
        background: #fff;
    }

    input:focus, select:focus, textarea:focus {
        outline: 2px solid #000;
        outline-offset: -2px;
    }

    input[type="checkbox"] {
        width: 14px;
        height: 14px;
        cursor: pointer;
    }

    .form-group {
        margin-bottom: 12px;
    }

    .form-label {
        display: block;
        margin-bottom: 4px;
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .form-row {
        display: flex;
        gap: 16px;
        align-items: flex-end;
    }
    
    fieldset {
        padding: 6px 10px 10px 10px;
    }

    /* Status Indicators */
    .status {
        display: inline-block;
        padding: 3px 8px;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .status-connected {
        background: #d4edda;
        color: #155724;
    }

    .status-offline {
        background: #f8d7da;
        color: #721c24;
    }

    .status-never {
        background: #e2e3e5;
        color: #383d41;
    }

    .status-inventory {
        background: #cce5ff;
        color: #004085;
    }

    .status-customer {
        background: #fff3cd;
        color: #856404;
    }

    .status-blocked {
        background: #f8d7da;
        color: #721c24;
    }

    .status-unblocked {
        background: #d4edda;
        color: #155724;
    }

    /* Badges */
    .badge {
        display: inline-block;
        padding: 3px 8px;
        font-size: 12px;
        background: #e9ecef;
        border: 1px solid #ccc;
        margin-right: 4px;
        margin-bottom: 4px;
    }

    /* Search/Filter Bar */
    .toolbar {
        display: flex;
        gap: 12px;
        margin-bottom: 16px;
        align-items: center;
        flex-wrap: wrap;
    }

    .search-box {
        width: 250px;
    }

    /* Panels */
    .panel {
        background: #fff;
        border: 1px solid #000;
        margin-bottom: 16px;
    }

    .panel-header {
        padding: 14px 18px;
        border-bottom: 1px solid #ccc;
        font-weight: bold;
        font-size: 14px;
        background: #f8f8f8;
    }

    .panel-body {
        padding: 16px;
    }

    /* Alerts */
    .alert {
        font-family: 'Courier New', Courier, monospace;
        font-size: 14px;
        padding: 10px 14px;
        border: 1px solid #000;
        background: #fff;
        color: #000;
        margin: 8px 0 12px 0;
    }

    .alert-error {
        background: #f8d7da; /* light red */
        color: #721c24;      /* dark red text */
        border-color: #721c24;
    }

    .alert-success {
        background: #d4edda; /* light green */
        color: #155724;      /* dark green text */
        border-color: #155724;
    }

    /* Vehicle Detail Specific */
    .detail-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
    }

    .detail-row {
        display: flex;
        border-bottom: 1px solid #eee;
        padding: 6px 0;
    }

    .detail-label {
        width: 160px;
        font-size: 13px;
        text-transform: uppercase;
        color: #666;
        flex-shrink: 0;
    }

    .detail-value {
        flex: 1;
    }

    .map-placeholder {
        background: #e9ecef;
        height: 200px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px dashed #ccc;
        color: #666;
    }

    /* Reports Specific */
    .reports-layout {
        display: grid;
        grid-template-columns: 220px 1fr;
        gap: 16px;
        min-height: 600px;
    }

    .report-templates {
        background: #fff;
        border: 1px solid #000;
    }

    .report-template-item {
        padding: 12px 14px;
        border-bottom: 1px solid #eee;
        cursor: pointer;
        font-size: 16px;
    }

    .report-template-item:hover {
        background: #f5f5f5;
    }

    .report-template-item.active {
        background: #000;
        color: #fff;
    }

    .report-main {
        display: flex;
        flex-direction: column;
        gap: 16px;
    }

    .report-config {
        background: #fff;
        border: 1px solid #000;
        padding: 16px;
    }

    .report-output {
        background: #fff;
        border: 1px solid #000;
        flex: 1;
        min-height: 300px;
        display: flex;
        flex-direction: column;
    }

    .report-output-header {
        padding: 12px 16px;
        border-bottom: 1px solid #ccc;
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: #f8f8f8;
    }

    .report-output-body {
        flex: 1;
        overflow: auto;
        padding: 0;
    }

    .report-empty {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 200px;
        color: #666;
    }

    /* Onboarding Tab - Match existing style */
    .onboard-section {
        margin-bottom: 24px;
    }

    .onboard-header {
        font-weight: bold;
        padding: 8px;
        background: #f0f0f0;
        border: 1px solid #ccc;
        margin-bottom: 0;
    }

    .onboard-toolbar {
        padding: 8px;
        border: 1px solid #ccc;
        border-top: none;
        background: #fff;
        display: flex;
        gap: 8px;
        align-items: center;
        flex-wrap: wrap;
    }

    .action-btn {
        font-family: 'Courier New', Courier, monospace;
        font-size: 13px;
        padding: 5px 10px;
        background: #c00;
        color: #fff;
        border: none;
        cursor: pointer;
        text-transform: uppercase;
    }

    .action-btn:hover {
        background: #900;
    }

    .action-btn.secondary {
        background: #666;
    }

    .action-btn.secondary:hover {
        background: #444;
    }

    .pagination {
        display: flex;
        gap: 8px;
        align-items: center;
        margin-top: 8px;
    }

    .pagination-btn {
        padding: 5px 10px;
        border: 1px solid #ccc;
        background: #fff;
        cursor: pointer;
        font-family: 'Courier New', Courier, monospace;
        font-size: 14px;
    }

    .pagination-btn:hover {
        background: #f0f0f0;
    }

    .pagination-btn.active {
        background: #000;
        color: #fff;
    }

    /* Settings */
    .settings-form {
        max-width: 500px;
    }

    .settings-section {
        margin-bottom: 24px;
    }

    .settings-section-title {
        font-weight: bold;
        margin-bottom: 12px;
        padding-bottom: 8px;
        border-bottom: 1px solid #ccc;
    }

    /* Link styling */
    a {
        color: #000;
    }

    .link {
        color: #0066cc;
        cursor: pointer;
        text-decoration: underline;
    }

    .link:hover {
        color: #004499;
    }

    /* Saved Reports Tiles */
    .saved-report-tile {
        cursor: pointer;
    }

    .saved-report-tile:hover {
        background: #f5f5f5;
    }

    .saved-report-name {
        font-weight: bold;
        margin-bottom: 8px;
    }

    .saved-report-meta {
        font-size: 14px;
        color: #666;
    }

    /* Fleet Groups */
    .group-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .group-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 12px;
        background: #fff;
        border: 1px solid #ccc;
    }

    .group-info {
        display: flex;
        gap: 16px;
        align-items: center;
    }

    .group-name {
        font-weight: bold;
    }

    .group-stats {
        font-size: 14px;
        color: #666;
    }

    /* Two column layout */
    .two-col {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 24px;
    }

    /* Tabs within a page */
    .inner-tabs {
        display: flex;
        border-bottom: 1px solid #000;
        margin-bottom: 16px;
    }

    .inner-tab {
        padding: 8px 16px;
        cursor: pointer;
        border: 1px solid transparent;
        border-bottom: none;
        margin-bottom: -1px;
        background: #f0f0f0;
    }

    .inner-tab:hover {
        background: #e0e0e0;
    }

    .inner-tab.active {
        background: #fff;
        border-color: #000;
    }

    /* Controls section in vehicle detail */
    .controls-section {
        display: flex;
        gap: 16px;
        align-items: center;
        padding: 16px;
        background: #f8f8f8;
        border: 1px solid #ccc;
    }

    .control-status {
        flex: 1;
    }

    .control-buttons {
        display: flex;
        gap: 8px;
    }

    /* Modal (shared across elements) */
    .modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
    }

    /* Backward-compat support if elements toggle .active */
    .modal-overlay.active {
        display: flex;
    }

    /* Dialog container */
    .modal-content, .modal {
        background: #fff;
        border: 1px solid #000;
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        max-width: 800px;
        width: min(90vw, 800px);
        max-height: 90vh;
        overflow: hidden; /* header/footer stick, body scrolls */
    }

    .modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        border-bottom: 1px solid #e5e7eb;
        font-weight: bold;
    }

    .modal-header h3 {
        margin: 0;
        font-size: 18px;
        color: #000;
    }

    .modal-close {
        background: none;
        border: 1px solid transparent;
        font-size: 20px;
        cursor: pointer;
        color: #333;
        padding: 0;
        width: 32px;
        height: 32px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
    }

    .modal-close:hover {
        background-color: #f3f4f6;
        border-color: #ccc;
    }

    .modal-body {
        padding: 16px;
        overflow: auto;
        max-height: calc(90vh - 56px); /* subtract header approx */
    }

    .modal-footer {
        padding: 12px 16px;
        border-top: 1px solid #e5e7eb;
        display: flex;
        gap: 8px;
        justify-content: flex-end;
        background: #fff;
    }

    /* Clickable report rows */
    .report-row {
        cursor: pointer;
    }

    .report-row:hover {
        background: #f5f5f5;
    }

    /* Responsive */
    @media (max-width: 1200px) {
        .tiles-grid {
            grid-template-columns: repeat(2, 1fr);
        }
        .reports-layout {
            grid-template-columns: 180px 1fr;
        }
    }

    @media (max-width: 900px) {
        .tiles-grid {
            grid-template-columns: 1fr;
        }
        .detail-grid {
            grid-template-columns: 1fr;
        }
        .two-col {
            grid-template-columns: 1fr;
        }
        .reports-layout {
            grid-template-columns: 1fr;
        }
    }

    /* Utility */
    .text-right {
        text-align: right;
    }
    .text-center {
        text-align: center;
    }
    .mb-16 {
        margin-bottom: 16px;
    }
    .mb-24 {
        margin-bottom: 24px;
    }
    .mt-16 {
        margin-top: 16px;
    }
`;