import { Component } from 'react';
export default class ErrorBoundary extends Component {
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 componentDidCatch(){console.error('UI_RENDER_ERROR');}
 render(){return this.state.failed?<section className="page-section top-spaced"><div className="container"><h1>Не удалось открыть страницу</h1><p>Обновите страницу и попробуйте ещё раз.</p><button className="cta-button" onClick={()=>window.location.reload()}>Обновить</button></div></section>:this.props.children;}
}
