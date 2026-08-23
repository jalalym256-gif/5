// ========== UTILITY FUNCTIONS ==========
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatPrice(price) {
    if (!price && price !== 0) return '۰';
    return new Intl.NumberFormat('fa-IR').format(price);
}

function formatDate(dateString) {
    if (!dateString) return '';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('fa-IR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (e) {
        return dateString;
    }
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ========== CUSTOMER CLASS ==========
class Customer {
    constructor(name, phone) {
        this.id = this.generateNumericId();
        this.name = name || '';
        this.phone = phone || '';
        this.notes = '';
        this.measurements = this.createEmptyMeasurements();
        this.models = {
            yakhun: [],
            sleeve: [],
            skirt: [],
            features: [],
            buttons: [],
            sleeveSubOptions: {} // مثال: { "کفک": "با پلت" }
        };
        this.sewingPriceAfghani = null;
        this.deliveryDay = '';
        this.paymentReceived = false;
        this.paymentDate = null;
        this.orders = [];
        this.createdAt = new Date().toISOString();
        this.updatedAt = new Date().toISOString();
        this.deleted = false;
        this.version = 1;
    }

    generateNumericId() {
        // IDهای موجود رو جمع کن
        const existingIds = new Set(
            (window.customers || []).map(c => String(c.id))
        );

        // از یه عدد تصادفی شروع کن، اگه تکراری بود یکی بالاتر برو
        const start = Math.floor(1000 + Math.random() * 9000);
        for (let i = 0; i < 9000; i++) {
            const candidate = String(((start - 1000 + i) % 9000) + 1000);
            if (!existingIds.has(candidate)) {
                return candidate;
            }
        }

        // اگه همه ۹۰۰۰ ID پر بود (نباید پیش بیاد)
        return String(Date.now()).slice(-4);
    }

    createEmptyMeasurements() {
        const measurements = {};
        AppConfig.MEASUREMENT_FIELDS.forEach(field => {
            measurements[field] = '';
        });
        return measurements;
    }

    validate() {
        const errors = [];
        
        if (!this.name || this.name.trim().length < 2) {
            errors.push('نام مشتری باید حداقل ۲ کاراکتر باشد');
        }
        
        if (!this.phone || this.phone.trim().length < 7 || !/^\d+$/.test(this.phone)) {
            errors.push('شماره تلفن باید حداقل ۷ رقم عددی باشد');
        }
        
        AppConfig.MEASUREMENT_FIELDS.forEach(field => {
            const value = this.measurements[field];
            if (value && isNaN(parseFloat(value))) {
                errors.push(`فیلد ${field} باید عددی باشد`);
            }
        });
        
        if (this.sewingPriceAfghani && isNaN(parseInt(this.sewingPriceAfghani))) {
            errors.push('قیمت باید عددی باشد');
        }
        
        return errors;
    }

    toObject() {
        return {
            id: this.id,
            name: this.name,
            phone: this.phone,
            notes: this.notes,
            measurements: this.measurements,
            models: this.models,
            sewingPriceAfghani: this.sewingPriceAfghani,
            deliveryDay: this.deliveryDay,
            paymentReceived: this.paymentReceived,
            paymentDate: this.paymentDate,
            orders: this.orders,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            deleted: this.deleted,
            version: this.version
        };
    }

    // یک مقدار مدل قدیمی (رشته تکی، آرایه، یا خالی) رو به آرایه‌ی استاندارد تبدیل می‌کنه
    // این‌طوری مشتری‌های قدیمی که مدل‌هاشون تک‌انتخابی (رشته) ذخیره شده، همچنان درست نمایش داده می‌شن
    static normalizeModelArray(value) {
        if (Array.isArray(value)) return value.filter(Boolean);
        if (typeof value === 'string' && value.trim() !== '') return [value.trim()];
        return [];
    }

    // ساختار models رو کامل و یکدست می‌کنه (سازگار با رکوردهای قدیمی/ناقص)
    static normalizeModels(models) {
        const src = (models && typeof models === 'object') ? models : {};
        return {
            yakhun: Customer.normalizeModelArray(src.yakhun),
            sleeve: Customer.normalizeModelArray(src.sleeve),
            skirt: Customer.normalizeModelArray(src.skirt),
            features: Customer.normalizeModelArray(src.features),
            buttons: Customer.normalizeModelArray(src.buttons),
            sleeveSubOptions: (src.sleeveSubOptions && typeof src.sleeveSubOptions === 'object') ? src.sleeveSubOptions : {}
        };
    }

    static fromObject(obj) {
        if (!obj || typeof obj !== 'object') {
            return new Customer('', '');
        }
        
        const customer = new Customer(obj.name || '', obj.phone || '');
        
        // مهم: ID اصلی رو از دیتابیس بگیر — نه ID جدید تصادفی
        if (obj.id) customer.id = obj.id;
        
        Object.keys(obj).forEach(key => {
            if (key !== 'id' && key !== 'name' && key !== 'phone') {
                try {
                    customer[key] = obj[key];
                } catch (e) {}
            }
        });
        
        if (!Array.isArray(customer.orders)) customer.orders = [];
        customer.models = Customer.normalizeModels(customer.models);
        if (!customer.measurements) customer.measurements = customer.createEmptyMeasurements();
        
        AppConfig.MEASUREMENT_FIELDS.forEach(field => {
            if (customer.measurements[field] && typeof customer.measurements[field] === 'string') {
                const numValue = parseFloat(customer.measurements[field]);
                if (!isNaN(numValue)) {
                    customer.measurements[field] = numValue;
                }
            }
        });
        
        if (customer.sewingPriceAfghani && typeof customer.sewingPriceAfghani === 'string') {
            const priceValue = parseInt(customer.sewingPriceAfghani);
            if (!isNaN(priceValue)) {
                customer.sewingPriceAfghani = priceValue;
            }
        }
        
        return customer;
    }
}