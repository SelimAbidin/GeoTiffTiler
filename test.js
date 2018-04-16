


function f1() {
    return p1
}

function f2() {
    return p2
}

function f3() {
    return p3
}



var p1 = new Promise((resolve, reject) => { 
    setTimeout(resolve, 5000, 'one'); 
}); 

var p2 = new Promise((resolve, reject) => { 
    setTimeout(resolve, 5000, 'two'); 
});

var p3 = new Promise((resolve, reject) => {
setTimeout(resolve, 5000, 'three');
});

setTimeout(() => {
    
    console.log('bitti');
    
}, 5000);



async function baslat(params) {
    return await Promise.all([f1(), f2(), f3()])
}

baslat().then(f => {

    console.log(f);
    
})