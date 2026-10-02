import sys,os,glob
from PIL import Image,ImageDraw
d=sys.argv[1]; out=sys.argv[2]; cols=int(sys.argv[3]) if len(sys.argv)>3 else 4
fs=sorted(glob.glob(d+'/*.png')); W=480; H=270; per=cols*5
for k in range(0,len(fs),per):
    chunk=fs[k:k+per]; rows=(len(chunk)+cols-1)//cols
    sh=Image.new('RGB',(cols*(W+6),rows*(H+22)),(30,30,30)); dr=ImageDraw.Draw(sh)
    for i,f in enumerate(chunk):
        im=Image.open(f).convert('RGB').resize((W,H)); x=(i%cols)*(W+6); y=(i//cols)*(H+22)
        sh.paste(im,(x,y)); dr.text((x+4,y+H+4),os.path.basename(f)[1:-4],fill=(255,200,120))
    sh.save(f'{out}{k//per+1}.png')
    print(f'{out}{k//per+1}.png')
