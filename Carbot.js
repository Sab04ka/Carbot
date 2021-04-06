const { Telegraf } = require('telegraf') //подключаем библеотеку telegraf
const mongoose = require("mongoose")
const session = require('telegraf/session.js')
const axios = require('axios')
var request = require('request');
const Schema = mongoose.Schema
const bot = new Telegraf('1758484230:AAFzlPOXTgV7m7a8jWFGoPfCqi39bF7BrtY') //сюда помещается токен, который дал botFather
const db = "mongodb://localhost:27017/cardb" //токен базы данных
const {Builder, By, until, Key} = require('selenium-webdriver');
const firefox = require('selenium-webdriver/firefox');
const options = new firefox.Options()
mongoose.connect(db, { useUnifiedTopology: true, useNewUrlParser: true })

bot.use(session())
const formatter = new Intl.NumberFormat("en-US", {
    style: "decimal",
    minimumFractionDigits: 0,
})
const userScheme = new Schema({ //создаем схемы для юзеров и тасков
    name: String,
    chatid: Number,
    address: String,
    phone_num: String
})
const requestScheme = new Schema({ //создаем схемы для юзеров и тасков
    id: Number,
    name: String,
    brand: String,
    model: String,
    year: Number,
    vin: String,
    product: Array,
    product_code: String,
    product_name: String
})
const User = mongoose.model("User", userScheme)
const Requests = mongoose.model("Request", requestScheme)

let j = 1
let tolkan, search = []

const params = new URLSearchParams()
const button_start = {
    reply_markup: JSON.stringify({
        keyboard: [
            [{ text: 'Купить'}]
        ], resize_keyboard: true
    })
}
const button_yesno = {
    reply_markup: JSON.stringify({
        inline_keyboard: [
            [{ text: 'Да', callback_data: 'yes'}, { text: 'Нет', callback_data: 'no'}]
        ], one_time_keyboard: true
    })
}
const button_buy = {
    reply_markup: JSON.stringify({
        inline_keyboard: [
            [{ text: 'Выбрать', callback_data: 'buy'}]
        ], one_time_keyboard: true
    })
}
const button_clear = {
    reply_markup: {
        remove_keyboard: true
    }
}

options.addArguments('--headless')
options.addArguments('--disable-dev-shm-usage')
options.addArguments('--no-sandbox')

bot.start(async ctx => { //ответ бота а команду /start
    ctx.reply('Добро пожаловать ' + ctx.message.from.first_name, button_start)
    ctx.session.step = 0
})
bot.hears('Купить', async ctx => {
    ctx.reply('Введите пожалуйста гос номер Авто:')
    ctx.session.step = 1
})
bot.on('text', async ctx => {
    switch(ctx.session.step){
        case 1:
            await ctx.reply('Секундочку, мы обрабатываем информацию')
            ctx.session.step = 0
            ctx.session.auto = ctx.update.message.text
            await params.append('car_num', ctx.session.auto)
            const config = {
                headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
            await axios.post('https://nomad.kz/ajax/get_car_age.php', params, config)
                .then( async (result) => {
                if(result.data.status == 'error'){
                    ctx.reply('Данные вашего автомобиля не найдены, пожалуйста повторите попытку:')
                } else {
                    await ctx.reply("Данные о вашем автомобиле:\nМарка: " + result.data.real_brand + "\nМодель: " + result.data.real_model + "\nГод выпуска: " + result.data.date + '\nVIN код: ' + result.data.vin)
                    ctx.session.vin = result.data.vin
                    ctx.session.id = (await Requests.find()).length
                    search = []
                    const newrequest = new Requests({ id: ctx.session.id, name: ctx.message.from.first_name, brand: result.data.real_brand, model: result.data.real_model, year: result.data.date, vin: result.data.vin})
                    newrequest.save()
                    ctx.reply('Что вы желаете купить?')
                    ctx.session.step = 2
                }
            })
                .catch((err) => {
                console.log(err)
            })
            break
        case 2:
            ctx.session.tovar = ctx.update.message.text
            ctx.reply('Спасибо, мы сверяем данные, ожидайте ответа')
            search.push(ctx.update.message.text)
            Requests.updateOne({id: ctx.session.id}, {product: search}, function(err, result){
                if(err) return console.log(err);
                console.log(result);
            })
            ctx.session.step = 0
            start(ctx)
            break
        case 3:
            ctx.session.address = ctx.update.message.text
            ctx.reply('Отлично, теперь поделитесь Вашим номером телефона чтобы мы могли с вами связаться',
                {"reply_markup": JSON.stringify({
                    "keyboard": [
                        [{ text: "Поделиться номером", request_contact: true }]
                    ],
                    "one_time_keyboard" : true,
                    "resize_keyboard": true
                })}
                )
            ctx.session.step = 0
            break
        default:
            ctx.reply('Извините, но на данный момент у вас нет возможности писать')
    }
})
bot.on('callback_query', async ctx => {
    if(ctx.update.callback_query.data == 'buy'){
        let index = ctx.update.callback_query.message.text.split(')')
        await ctx.reply('Уточняем наличие, минуту')
        console.log(index)
        if (Number(index[0])){
            Sklad(ctx)
            ctx.session.code = ctx.session.code[index[0] - 1]
            ctx.session.step = 0
        }
    } else if (ctx.update.callback_query.data == 'yes'){
        ctx.deleteMessage()
        const user = await User.findOne({chatid: ctx.update.callback_query.from.id})
        Requests.updateOne({id: ctx.session.id}, {product_code: ctx.session.code, product_name: ctx.session.productname}, function(err, result){
            if(err) return console.log(err);
            console.log(result);
        });
        if(!user){ //сохраняем пользователей в базу данных, если пользователь есть в базе данных, то не сохраняет
            const newuser = new User({ name: ctx.update.callback_query.from.first_name, chatid: ctx.update.callback_query.from.id, address: '', phone_num: ''})
            newuser.save((err,saved)=>{
                if (err) console.log(err)
                if (saved) console.log('Пользователь сохранен')
                ctx.reply('Напишите адрес доставки: ')
                ctx.session.step = 3
            })
        } else {
            ctx.reply('Ваш заказ оформлен')
            ctx.session.step = 0
        }
    } else if (ctx.update.callback_query.data == 'no'){
        ctx.deleteMessage()
        ctx.reply('Cпасибо за использование нашего бота')
    }
})
bot.on('contact', ctx => {
    ctx.reply('Спасибо, ваша заявка принята', button_start)
    console.log(ctx.update.message.contact.phone_number)
    User.updateOne({chatid: ctx.message.from.id}, {address: ctx.session.address, phone_num: ctx.update.message.contact.phone_number}, function(err, result){
        if(err) return console.log(err);
        console.log(result);
    });
})

async function start(ctx) {
    ctx.session.code = []
    let driver = new Builder().forBrowser('firefox').setFirefoxOptions(options).build();
    console.log('запускаем браузер')
    try{
        await driver.get('https://auto3n.ru/');
        await driver.wait(until.elementLocated(By.id('search4')), 12000);
        await driver.findElement(By.css('#search4')).sendKeys(ctx.session.vin, Key.RETURN);
        await driver.findElement(By.css('.search-submit')).click()
        await driver.wait(until.elementLocated(By.id('qgsearchinput')), 10000);
        await driver.findElement(By.css('#qgsearchinput')).sendKeys(ctx.session.tovar, Key.RETURN);
        await driver.wait(until.elementLocated(By.css('.qgCurrentPath')), 10000);
        if (await driver.findElements(By.css('.qgFilteredName'))){
            console.log('Ищем данные')
            await driver.findElement(By.css('.qgFilteredName a')).click()
            await driver.wait(until.elementLocated(By.css('.g_ttd')), 10000);
            let block = await driver.findElements(By.css('.guayaquil_table'))
            for(let e = 0; e < block.length; e++){
                const ul = await block[e].findElements(By.css('.g_ttd'))
                console.log('отправляем данные')
                for (let i = 0; i < ul.length; i = i + 2){
                    const code = await ul[i].getText()
                    const name = await ul[i + 1].getText()
                    if(name){
                        ctx.session.code.push(code)
                        console.log(code, name)
                        await ctx.reply(j + ') ' + name, button_buy) 
                        j++
                    }
                }
            }
        } else {
            console.log('else')
        }
    } catch(err) {
        console.log(err)
        ctx.reply('Пожалуйста перефразируйсте ваш запрос:')
        ctx.session.step = 2
    } finally {
        // await driver.close();
        await driver.quit();
        console.log('Closed browser')
    }
}
async function Token(){
    let params = new URLSearchParams()
    params.append('api_key', 'b1f894fd25d34c6aac105d6719832fac')
    let config = {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
    }
    await axios.post('https://api.remonline.ru/token/new', params, config)
        .then( async (result) => {
        tolkan = result.data.token
    }).catch(err => {
        console.log(err)
    })
}
async function Sklad(ctx){
    await Token()
    axios.get('https://api.remonline.ru/warehouse/goods/801916', {
        params: {
            token: tolkan,
            exclude_zero_residue: true
        }
    })
        .then( async (result) => {
            result = result.data.data
            for(let i = 0; i < result.length; i++){
                if(ctx.session.code == result[i].code){
                    await ctx.reply(result[i].title + '\nЦена: ' + formatter.format(result[i].price[208380]).replace(/,/g, " ") + ' тенге')
                    ctx.session.productname = result[i].title
                    j = 1
                    await ctx.reply('Хотели бы оформить заказ?', button_yesno)
                }
            }
            if(j != 1){
                await ctx.reply('Извините, но данного товара нет в наличии, вы можете повторить попытку.\nНапишите нужную запчасть:')
                ctx.session.step = 2
                j = 1
            }
    }).catch(err => {
        console.log(28, err)
    })
}

bot.launch() // запуск бота