// Numeric expressions only; never evaluate executable input.
function calculate(raw) {
    const text=String(raw).replace(/×/g,'*').replace(/÷/g,'/').replace(/−/g,'-').replace(/\s/g,'');
    if(!text || text.length>80 || /[^0-9.+*/-]/.test(text))throw Error('请输入有效算式');
    const tokens=text.match(/(?:\d+(?:\.\d*)?|\.\d+)|[+*/-]/g)||[];
    if(tokens.join('')!==text)throw Error('请输入有效算式');let i=0;
    function number(){let sign=1;if(tokens[i]==='-'||tokens[i]==='+'){if(tokens[i++]==='-')sign=-1;}const token=tokens[i++];if(!token||!/^(?:\d|\.)/.test(token))throw Error('算式未完成');return Number(token)*sign;}
    function product(){let value=number();while(tokens[i]==='*'||tokens[i]==='/'){const op=tokens[i++],right=number();if(op==='/'&&right===0)throw Error('不能除以0');value=op==='*'?value*right:value/right;}return value;}
    let value=product();while(i<tokens.length){const op=tokens[i++];if(!['+','-'].includes(op))throw Error('请输入有效算式');const right=product();value=op==='+'?value+right:value-right;}
    if(!Number.isFinite(value))throw Error('计算结果过大');return Math.round(value*10000)/10000;
}
module.exports={calculate};
