const voice = require('../../utils/voice-note');
const routes = { home: '/pages/index/index', analysis: '/pages/analysis/analysis', profile: '/pages/profile/profile' };

Component({
    properties: { active: { type: String, value: 'home' }, theme:{type:String,value:'light'}, opacity:{type:Number,value:18}, blur:{type:Number,value:16}, glass:{type:Boolean,value:true} },
    data: { expanded: false, recording: false, canceling: false, busy: false, quickText: '', quickSubmitting: false, secondsText: '00:00', bars: [12, 24, 36, 20, 46, 58, 32, 50, 28, 44, 20, 34, 12] },
    lifetimes: { detached() { this.cleanup(); } },
    pageLifetimes: { hide() { this.cleanup(); } },
    methods: {
        measureAddTarget(callback) { this.createSelectorQuery().select('.fab').boundingClientRect(callback).exec(); },
        noop() {},
        close() { this.setData({ expanded: false }); },
        toggle() {
            if (Date.now() < (this.ignoreTapUntil || 0)) return;
            if (this.suppressTap || this.data.busy || this.data.recording) return;
            this.setData({ expanded: !this.data.expanded });
        },
        manual() { this.openRecord('manual'); },
        photo() { this.openRecord('photo'); },
        quickInput(event) { this.setData({ quickText: event.detail.value }); },
        quickSubmit() {
            const text = this.data.quickText.trim();
            if (this.data.quickSubmitting) return;
            if (!text) { wx.showToast({ title: '请先输入吃了什么', icon: 'none' }); return; }
            this.setData({ quickSubmitting: true });
            const app = getApp();
            app.globalData.quickMealText = text;
            wx.navigateTo({ url: '/pages/add/add?mode=quick', success: () => this.setData({ quickText: '', expanded: false }), fail: () => { if (app.globalData.quickMealText === text) app.globalData.quickMealText = ''; wx.showToast({ title: '打开记餐页面失败，请重试', icon: 'none' }); }, complete: () => this.setData({ quickSubmitting: false }) });
        },
        openRecord(mode) {
            this.close();
            wx.navigateTo({ url: '/pages/add/add?mode=' + mode });
        },
        navigate(event) {
            const key = event.currentTarget.dataset.page;
            if (key === this.properties.active || this.data.busy || this.data.recording) return;
            this.close();
            wx.redirectTo({ url: routes[key] });
        },
        touchStart(event) {
            if (this.data.recording || this.data.busy || this.session) return;
            this.holding = true;
            this.moved=false;
            this.suppressTap = false;
            this.setData({canceling:false});
            const touch=(event.touches && event.touches[0]) || (event.changedTouches && event.changedTouches[0]);
            this.touchId=touch ? touch.identifier : undefined;
            this.startY=touch ? (typeof touch.clientY==='number' ? touch.clientY : touch.pageY) : undefined;
            clearTimeout(this.holdTimer);
            this.holdTimer=setTimeout(()=>this.longPress(),250);
        },
        longPress() {
            if (this.data.busy || !this.holding || this.session) return;
            clearTimeout(this.holdTimer);
            this.suppressTap = true;
            this.setData({ expanded: false, busy: true });
            const token = {};
            this.session = token;
            voice.start(result => this.complete(result, token)).then(started => {
                if (this.session !== token || !this.holding) {
                    if (started) voice.stop(true);
                    if (this.session === token) this.setData({ busy: false });
                    return;
                }
                if (!started) { this.session=null;this.setData({ busy: false }); return; }
                token.started=true;
                this.startedAt = Date.now();
                this.setData({ recording: true, busy: false, secondsText: '00:00' });
                this.timer = setInterval(() => {
                    const seconds = Math.min(60, Math.floor((Date.now() - this.startedAt) / 1000));
                    this.setData({ secondsText: (seconds < 60 ? '00:' : '01:') + ('0' + seconds % 60).slice(-2) });
                }, 200);
            }).catch(()=>{
                if(this.session!==token)return;
                voice.stop(true);
                this.session=null;this.holding=false;
                clearInterval(this.timer);
                this.setData({recording:false,busy:false,canceling:false});
                wx.showToast({title:'录音启动失败，请检查应用录音能力',icon:'none'});
            });
        },
        touchMove(event) {
            if (!this.holding) return;
            const touches=event.touches || [];
            const touch=touches.find(item=>this.touchId===undefined || item.identifier===this.touchId) || touches[0];
            if(!touch) return;
            const y=typeof touch.clientY==='number' ? touch.clientY : touch.pageY;
            if(typeof y!=='number') return;
            if(Math.abs(this.startY-y)>12) this.moved=true;
            const canceling=this.startY-y>55;
            if(this.data.canceling!==canceling) this.setData({canceling});
        },
        touchEnd(event) {
            if(event && event.changedTouches && event.changedTouches.length) this.touchMove({touches:event.changedTouches});
            const shortTap=this.holding && !this.suppressTap && !this.session && !this.data.busy && !this.moved;
            clearTimeout(this.holdTimer);
            this.holding = false;
            // catchtouchend may suppress the native tap. Handle a short press
            // here and discard any synthetic tap, independently of recording.
            if(shortTap){
                this.setData({expanded:!this.data.expanded});
                this.ignoreTapUntil=Date.now()+500;
            }
            if (this.session) {
                clearInterval(this.timer);
                this.setData({ recording: false, busy: true });
                voice.stop(this.data.canceling || !this.session.started);
            }
            // touchend precedes tap; suppress the synthetic tap after a long press.
            clearTimeout(this.tapTimer);
            this.tapTimer = setTimeout(() => { this.suppressTap = false; }, 350);
        },
        touchCancel() {
            clearTimeout(this.holdTimer);
            this.holding = false;
            this.suppressTap = true;
            if (this.session) { this.setData({ canceling: true }); this.touchEnd(); }
        },
        complete(result, token) {
            if (this.session !== token) return;
            const canceled = this.data.canceling;
            this.session = null;
            this.holding = false;
            clearInterval(this.timer);
            clearTimeout(this.holdTimer);
            this.setData({ recording: false, busy: false, canceling: false });
            if (canceled) return;
            if (!result.ok) {
                if (!result.canceled) wx.showToast({ title: result.error || '录音失败，请重试', icon: 'none' });
                return;
            }
            getApp().globalData.voiceNote = { path: result.path, duration: result.duration, recordedAt: Date.now() };
            this.openRecord('voice');
        },
        cleanup() {
            this.session = null;
            this.holding = false;
            clearInterval(this.timer);
            clearTimeout(this.holdTimer);
            clearTimeout(this.tapTimer);
            if (this.suppressTap) voice.stop(true);
            this.setData({ recording: false, busy: false, expanded: false, canceling:false });
        },
    },
});
