import { Bot, Context, Logger, Schema } from 'koishi'

export const name = 'webhook-trigger-action'
export const inject = ['server']

export interface responseType {
    platform: string
    sid: string
    seeisonId: string[]
    msg: string[]
}

export interface Webhook {
    method: string,
    headers: { [key: string]: string }
    response: responseType[]
}

export interface Config {
    [key: string]: Webhook
}

export const Config = Schema.dict(
    Schema.object({
        method: Schema.union(['get', 'post']).default('get').description('监听方式'),
        headers: Schema.dict(Schema.string()).role('table').description('检查头 如果填写则需要在请求头中包含'),
        response: Schema.array(Schema.object({
            platform: Schema.union(['onebot', 'kook', 'telegram', 'discord', 'lark', 'chronocat']).default('onebot').description('机器人平台'),
            sid: Schema.string().required().description('机器人id，用于获取Bot对象'),
            seeisonId: Schema.array(Schema.string().required()).role('table').description('群聊/私聊对象id,私聊对象需在前方加上`private:`,如`private:123456`'),
            msg: Schema.array(Schema.string().default("hello {name}.")).role('table').required().description('需要发送的信息，会使用换行符合并<br>接收的body会按照JSON解析，并将key以{key}形式全替换字符串内容')
        })).description('响应')
    })).description("监听指定路径，如:`/api`")


export interface varDict {
    [key: string]: string
}

function sendResponseMsg(bot: Bot, platform: string, rep: responseType, dict: varDict){
    let msg = rep.msg.join("\n");
    for(const key in dict) {
        msg = msg.replace(new RegExp(`{${key}}`, 'g'), dict[key]);
    }
    rep.seeisonId.forEach(element => {
        bot.createMessage(element, msg);
    });
}

export function apply(ctx: Context, config: Config) {
    const logger = ctx.logger(name);

    for (let path in config) {
        let item = config[path];
        ctx.server[item.method](path, (c, next)=>{
            logger.info(`接收到 ${item.method} 请求：${path}`)
            for (let httpheader in config.headers) {// 检查头，如果不相等则返回400
                if (c.header[httpheader] != config.headers[httpheader]) return c.status = 400;
            }
            next();
        }, (c)=>{
            let body = item.method === "get" ? JSON.parse(JSON.stringify(c.request.query)) : c.request.body;
            for(const key in body) {
                logger.info(`{${key}} => ${body[key]}`);
            }
            for (let bot of ctx.bots) {
                for (let rep of item.response) {
                    if (bot.platform != rep.platform && bot.selfId != rep.sid) {// 过滤机器人平台，用户名
                        continue;
                    }
                    sendResponseMsg(bot, rep.platform, rep, body ? body : {});
                    return c.status = 200;
                }
            }
            logger.error(`没有找到任何可发送的机器人,可用列表:[${ctx.bots.map((v)=>`${v.platform},${v.selfId}`)}]`)
            return c.status = 405;
        });
    }
}
