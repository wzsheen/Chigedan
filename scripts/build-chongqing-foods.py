"""Build regional recipe estimates from a local USDA SR Legacy CSV archive.
These are transparent example recipes, not laboratory values for Chongqing dishes.
Usage: python scripts/build-chongqing-foods.py <usda-sr-legacy.zip>
"""
import zipfile,csv,io,json,sys
from pathlib import Path
z=zipfile.ZipFile(sys.argv[1]);prefix=z.namelist()[0]
def rows(name):return csv.DictReader(io.TextIOWrapper(z.open(prefix+name+'.csv'),encoding='utf-8-sig'))
ids={'tofu':172475,'starch':169698,'noodles':168928,'flour':168894,'rice':168878,'riceflour':169714,'riceNoodle':168914,'pork':167905,'belly':167812,'beef':174032,'chicken':171477,'giblets':171058,'duck':172409,'tripe':174769,'intestine':167856,'fish':174185,'shrimp':None,'egg':173424,'oil':171411,'sugar':169655,'soy':174277,'peanut':172430,'peas':170420,'potato':170440,'lotus':168430,'cabbage':169975,'cucumber':168409,'greens':169249,'pepper':170427,'chili':170106,'milk':171265,'soyMilk':175215,'oats':173904,'taro':168486,'chives':169994,'enoki':169382}
# Shrimp uses the project's existing estimated household portion as an explicitly marked proxy.
selected={v for v in ids.values() if v};desc={int(r['fdc_id']):r['description'] for r in rows('food') if int(r['fdc_id']) in selected};nut={i:{} for i in selected}
for r in rows('food_nutrient'):
 i=int(r['fdc_id']);key={'1008':'k','1003':'p','1005':'c','1004':'f'}.get(r['nutrient_id'])
 if i in nut and key:nut[i][key]=float(r['amount'])
bases={key:{'fdcId':i,'description':desc[i],'v':[nut[i][x] for x in ['k','p','c','f']]} for key,i in ids.items() if i}
bases['water']={'fdcId':None,'description':'Added water, zero-energy recipe assumption','v':[0,0,0,0]}
# Each recipe component is grams of edible ingredient; retained oil is explicitly included.
recipes={
 'chickenNoodle':{'noodles':200,'chicken':65,'cucumber':45,'oil':10,'soy':10},'taopian':{'riceflour':50,'sugar':35,'peanut':15,'water':10},'liangxia':{'riceflour':20,'water':200,'sugar':20},'roastBelly':{'belly':100,'oil':3,'soy':8},'taroChicken':{'chicken':150,'taro':150,'oil':15,'soy':12},'chives':{'chives':100,'oil':8,'soy':7},'enoki':{'enoki':100,'oil':8,'soy':7},
 'tofu':{'tofu':100,'soy':5},'roastTofu':{'tofu':100,'oil':6,'soy':6,'sugar':2},'spicyTofu':{'tofu':100,'oil':8,'chili':4,'soy':6},
 'skin':{'starch':35,'water':65},'roastSkin':{'starch':35,'water':65,'oil':6,'cabbage':20,'soy':6},'skinMeat':{'starch':35,'water':65,'pork':30,'oil':6,'soy':6},
 'noodle':{'noodles':220,'greens':40,'oil':12,'soy':12,'peanut':10,'water':60},'beefNoodle':{'noodles':220,'beef':65,'greens':35,'oil':12,'soy':12,'water':100},
 'peaNoodle':{'noodles':220,'peas':60,'pork':35,'greens':30,'oil':10,'soy':10,'water':60},'intestineNoodle':{'noodles':220,'intestine':65,'greens':35,'oil':10,'soy':10,'water':100},
 'riceNoodle':{'riceNoodle':250,'pork':35,'greens':40,'oil':10,'soy':10,'water':120},'sourNoodle':{'starch':70,'water':250,'peanut':12,'oil':12,'soy':12,'greens':30},
 'wonton':{'flour':70,'water':180,'pork':55,'greens':25,'oil':10,'soy':10},'coldNoodle':{'noodles':220,'cucumber':50,'oil':12,'peanut':12,'soy':10},
 'riceTofu':{'riceflour':30,'water':160,'oil':7,'soy':10},'riceCake':{'riceflour':65,'water':60,'sugar':12,'oil':8},'sweetRice':{'rice':150,'sugar':15,'peanut':8},
 'iceJelly':{'water':200,'sugar':25,'peanut':5},'tangyuan':{'riceflour':45,'water':45,'peanut':12,'sugar':10,'oil':4},
 'friedDough':{'flour':50,'water':15,'oil':14,'sugar':9},'roastPotato':{'potato':180,'oil':12,'soy':8,'chili':5},
 'roastMeat':{'pork':100,'oil':7,'soy':8,'sugar':2},'roastBeef':{'beef':100,'oil':7,'soy':8},'roastChicken':{'chicken':100,'oil':8,'soy':8},'roastVeg':{'cabbage':100,'oil':8,'soy':7},
 'roastLotus':{'lotus':100,'oil':8,'soy':7},'roastTripe':{'tripe':100,'oil':8,'soy':7},'potTripe':{'tripe':100,'oil':8,'soy':5},'potTofu':{'tofu':100,'oil':8,'soy':5},
 'potPotato':{'potato':100,'oil':8,'soy':5},'potLotus':{'lotus':100,'oil':8,'soy':5},'potBeef':{'beef':100,'oil':8,'soy':5},'potIntestine':{'intestine':100,'oil':8,'soy':5},
 'potGreens':{'greens':100,'oil':5,'soy':5},'hotpotMix':{'beef':70,'tripe':60,'tofu':70,'potato':100,'greens':120,'oil':22,'soy':15},
 'chicken':{'chicken':160,'pepper':60,'oil':20,'soy':15},'spicyChicken':{'chicken':160,'oil':25,'chili':25,'peanut':15,'soy':15},
 'giblets':{'giblets':150,'pepper':100,'oil':18,'soy':15},'fish':{'fish':180,'greens':120,'oil':25,'soy':15},'fishSoup':{'fish':150,'cabbage':100,'water':150,'oil':18,'soy':12},
 'twicePork':{'belly':100,'pepper':100,'oil':6,'soy':12},'porkStrips':{'pork':130,'pepper':100,'oil':16,'sugar':10,'soy':12},'mapo':{'tofu':180,'beef':30,'oil':18,'soy':12,'chili':8},
 'coldChicken':{'chicken':140,'cucumber':60,'oil':18,'peanut':12,'soy':12},'duck':{'duck':150,'soy':10,'sugar':5},'steamPork':{'belly':100,'riceflour':25,'potato':100,'soy':12},
 'tofuRice':{'rice':180,'tofu':150,'greens':50,'oil':10,'soy':12},'sausageRice':{'rice':180,'pork':60,'belly':20,'soy':8,'sugar':3},
 'milkSweet':{'milk':180,'rice':60,'sugar':20},'soyPlain':{'soyMilk':100},'soyDrink':{'soyMilk':240,'sugar':10},'tea':{'water':250},'pickle':{'cabbage':100,'soy':8,'sugar':2},
 'eggCake':{'egg':50,'flour':30,'water':20,'sugar':10,'oil':5},'pepperBeef':{'beef':150,'pepper':80,'oil':15,'soy':12},
 'coldLotus':{'lotus':150,'oil':8,'soy':10},'sesameBall':{'riceflour':35,'peanut':8,'sugar':10,'oil':10,'water':20},
}
# name, recipe, primary unit, estimated grams, aliases, extra household gram measures.
entries=[
 ['豆干','tofu','块',30,['豆腐干'],{'片':20,'串':60,'份':100}],['卤豆干','tofu','块',30,['卤豆腐干'],{'份':100}],['烤豆干','roastTofu','块',40,['烤豆腐干','烧烤豆干'],{'串':80,'份':120}],['麻辣豆干','spicyTofu','份',100,['香辣豆干'],{'块':30}],
 ['羊角豆干','spicyTofu','袋',80,['武隆羊角豆干'],{'块':25,'份':100}],['梁平豆干','spicyTofu','袋',80,['袁驿豆干'],{'块':25,'份':100}],['紫水豆干','tofu','块',40,['开州豆干'],{'份':100}],['火烤豆干','roastTofu','块',40,['彭氏豆干'],{'份':100}],
 ['苕皮','skin','块',80,['若皮','红薯苕皮'],{'张':100,'份':150}],['烤苕皮','roastSkin','张',120,['烧烤苕皮'],{'块':80,'份':150}],['苕皮包肉','skinMeat','份',180,['苕皮裹肉'],{'张':150}],['苕皮包酸萝卜','roastSkin','张',140,['酸萝卜苕皮'],{'份':180}],
 ['重庆小面','noodle','碗',350,['小面','麻辣小面'],{'份':350}],['豌杂面','peaNoodle','碗',400,['豌杂小面','豌豆杂酱面'],{'份':400}],['牛肉面','beefNoodle','碗',450,['麻辣牛肉面','重庆牛肉面'],{'份':450}],['肥肠面','intestineNoodle','碗',450,[],{'份':450}],
 ['杂酱面','peaNoodle','碗',380,['炸酱小面','杂酱小面'],{'份':380}],['铺盖面','noodle','碗',400,[],{'份':400}],['凉面','coldNoodle','份',280,['麻辣凉面','重庆凉面'],{'碗':280}],['鸡丝凉面','chickenNoodle','份',300,[],{}],
 ['酸辣粉','sourNoodle','碗',400,['重庆酸辣粉'],{'份':400}],['苕粉','sourNoodle','碗',400,['红薯粉','火锅苕粉'],{'份':400}],['肥肠粉','intestineNoodle','碗',450,[],{'份':450}],['米线','riceNoodle','碗',450,['砂锅米线','重庆米线'],{'份':450}],
 ['小汤圆','tangyuan','个',18,['山城小汤圆'],{'碗':180}],['红油抄手','wonton','碗',300,['抄手','重庆抄手'],{'个':25,'份':300}],['清汤抄手','wonton','碗',350,[],{'个':25}],['米豆腐','riceTofu','份',200,['凉拌米豆腐'],{'碗':250}],
 ['红糖糍粑','riceCake','块',35,['糍粑'],{'份':140}],['冰粉','iceJelly','碗',230,['红糖冰粉'],{'杯':230}],['凉虾','liangxia','碗',250,['红糖凉虾'],{'杯':250}],['醪糟汤圆','tangyuan','碗',230,['酒酿汤圆'],{}],
 ['麻花','friedDough','根',25,['磁器口麻花','陈麻花','山城麻花'],{'袋':100,'份':100}],['油钱','friedDough','个',45,['油粑粑'],{'份':90}],['油醪糟','sweetRice','碗',180,[],{}],['三角粑','riceCake','个',65,[],{'份':130}],
 ['熨斗糕','eggCake','个',60,[],{'份':120}],['叶儿粑','riceCake','个',80,[],{'份':160}],['合川桃片','taopian','片',12,['桃片'],{'份':60}],['麻圆','sesameBall','个',45,['麻团'],{'份':135}],
 ['狼牙土豆','roastPotato','份',200,['炸洋芋','炸土豆'],{'碗':200}],['烤土豆','roastPotato','串',60,['烤洋芋'],{'份':150}],['烤藕片','roastLotus','串',50,[],{'份':120}],['烤豆腐','roastTofu','串',60,[],{'份':150}],
 ['烤五花肉','roastBelly','串',35,[],{'份':120}],['烤牛肉串','roastBeef','串',30,['牛肉串'],{'份':120}],['烤鸡肉串','roastChicken','串',35,['鸡肉串'],{'份':120}],['烤韭菜','chives','串',40,[],{'份':120}],
 ['烤金针菇','enoki','串',50,[],{'份':150}],['烤毛肚','roastTripe','串',35,[],{'份':100}],['串串香','hotpotMix','份',350,['重庆串串'],{}],['麻辣串串','hotpotMix','份',350,['冷锅串串'],{}],
 ['火锅毛肚','potTripe','份',100,['毛肚'],{'片':15}],['火锅肥牛','potBeef','份',100,['肥牛'],{}],
 ['火锅肥肠','potIntestine','份',100,['肥肠'],{}],['火锅豆皮','potTofu','份',100,['豆皮','千张'],{'张':40}],['火锅土豆','potPotato','份',100,['土豆片'],{'片':15}],['火锅藕片','potLotus','份',100,['藕片'],{'片':15}],
 ['火锅青菜','potGreens','份',150,['涮青菜'],{}],['冒菜','hotpotMix','份',450,[],{}],['火锅荤素拼盘','hotpotMix','份',400,['重庆火锅荤素拼盘'],{}],
 ['辣子鸡','spicyChicken','份',250,['歌乐山辣子鸡'],{}],['泉水鸡','chicken','份',300,['南山泉水鸡'],{}],['芋儿鸡','taroChicken','份',350,[],{}],['黔江鸡杂','giblets','份',300,['干锅鸡杂'],{}],
 ['万州烤鱼','fish','份',350,['重庆烤鱼','烤鱼'],{}],['水煮鱼','fishSoup','份',350,[],{}],['酸菜鱼','fishSoup','份',350,[],{}],['回锅肉','twicePork','份',220,[],{}],
 ['鱼香肉丝','porkStrips','份',250,[],{}],['麻婆豆腐','mapo','份',250,[],{}],['口水鸡','coldChicken','份',220,[],{}],['棒棒鸡','coldChicken','份',220,[],{}],
 ['丰都麻辣鸡块','spicyChicken','份',220,['麻辣鸡块'],{}],['卤鸭','duck','份',150,['梁平卤鸭'],{}],['粉蒸肉','steamPork','份',220,[],{}],['豆花饭','tofuRice','份',400,[],{}],
 ['腊肉饭','sausageRice','份',300,['香肠饭'],{}],['泡椒牛肉','pepperBeef','份',250,['椒麻牛肉'],{}],['凉拌藕片','coldLotus','份',180,[],{}],['醪糟牛奶','milkSweet','碗',250,['牛奶醪糟'],{}],['无糖豆浆','soyPlain','杯',250,['原味无糖豆浆'],{'毫升':1,'ml':1,'份':250}],['含糖豆浆','soyDrink','杯',250,['重庆豆浆','豆浆'],{'毫升':1,'ml':1,'份':250}],['泡菜','pickle','份',80,['重庆泡菜'],{}]
]
# Prevent silently passing off unrelated ingredients as a prepared-dish measurement.
proxies={'starch':'玉米淀粉代替红薯淀粉作近似原料','noodles':'熟意面代替熟碱水面作近似原料','pork':'熟猪里脊作为瘦肉参考','riceflour':'普通米粉代替糯米粉作近似原料','tofu':'石膏老豆腐作为豆制品参考'}
meta={'source':'USDA SR Legacy 2018 ingredient data + app-authored illustrative recipes','references':['https://fdc.nal.usda.gov/download-datasets/','https://nyncw.cq.gov.cn/ztzl_161/rdzt/xczx/gzdt_249775/whzx/202502/t20250217_14310723_wap.html'],'notice':'全部为配方与参考份量估算，不是重庆菜品检测值；油量、品牌、干熟与大小不同均会改变数值。','proxies':proxies}
out='// Generated by scripts/build-chongqing-foods.py; recipe estimates, never measured dish values.\nmodule.exports='+json.dumps({'ingredients':bases,'recipes':recipes,'entries':entries,'meta':meta},ensure_ascii=False,separators=(',',':'))+';\n'
Path('utils/chongqing-data.js').write_text(out,encoding='utf-8');print('Regional food count:',len(entries))
