#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <mutex>
#include <string>
#include <thread>
#include <vector>
#include <Accelerate/Accelerate.h>
#include "current-youth-model.hpp"
namespace fs=std::filesystem;
constexpr int A=42,B=1000;
uint32_t hash(const std::string& s){uint32_t h=2166136261u;for(unsigned char c:s)h=(h^c)*16777619u;return h;}
struct RNG{uint32_t state;double next(){state+=0x6D2B79F5u;uint32_t t=state;t=(t^(t>>15))*(t|1);t^=t+(t^(t>>7))*(t|61);return double(t^(t>>14))/4294967296.;}};
double clip(double x,double lo,double hi){return std::max(lo,std::min(hi,x));}
struct Player{double ca=0,pa=0,attributes[A];int age,pos;};
Player generate(uint64_t index,bool vectorMath){
 Player p;p.age=15+index%3;p.pos=(index/3)%10;RNG r{hash("youth:v2:billion-current-v1:billion-"+std::to_string(index))};
 double normals[92];int n=p.pos==0?92:84;
 if(vectorMath){double u[92],angle[92];for(int k=0;k<n;k++){u[k]=std::max(1e-12,r.next());angle[k]=2*3.141592653589793*r.next();}vvlog(u,u,&n);vvcos(angle,angle,&n);for(int k=0;k<n;k++)u[k]*=-2;vvsqrt(u,u,&n);for(int k=0;k<n;k++)normals[k]=u[k]*angle[k];}
 else for(int k=0;k<n;k++){double u=std::max(1e-12,r.next()),v=r.next();normals[k]=std::sqrt(-2*std::log(u))*std::cos(2*3.141592653589793*v);}
 int cursor=0;double shared=normals[cursor++],domains[4];for(int g=0;g<4;g++)domains[g]=clip(66+9*shared+5*normals[cursor++],38,92);
 double shift=clip(normals[cursor++]*.9,-1.8,1.8);cursor++;double prior=clip(normals[cursor++],-2,2);
 double denominator=0;
 for(int k=0;k<A;k++){
  int group=GROUP[k];bool important=WEIGHTS[p.pos][k]>0,unused=group==3&&p.pos!=0;
  double ceiling=unused?clip(12+normals[cursor++]*4,1,25):clip(domains[group]+(important?5:0)+normals[cursor++]*4,20,99);
  double effect=group==1?2.5:group==2?.5:1;
  double initial=unused?ceiling:46+(p.age-15)*3+(important?2:0)+(domains[group]-66)*.25+prior*3-shift*effect+normals[cursor++]*4;
  if(p.pos==0&&group==0)initial-=18;
  p.attributes[k]=clip(initial,1,std::max(1.,ceiling-4));
  p.ca+=p.attributes[k]*WEIGHTS[p.pos][k];p.pa+=ceiling*WEIGHTS[p.pos][k];denominator+=WEIGHTS[p.pos][k];
 }
 if(cursor!=n)throw std::runtime_error("Random draw count mismatch");p.ca/=denominator;p.pa/=denominator;return p;
}
struct Stat{
 uint64_t n=0,h[B]={};double sum=0,sum2=0,min=100,max=0;
 void add(double x){n++;sum+=x;sum2+=x*x;min=std::min(min,x);max=std::max(max,x);h[std::min(B-1,std::max(0,int(std::floor(x*10))))]++;}
 void write(std::ostream& o){o<<"{\"count\":"<<n<<",\"sum\":"<<sum<<",\"sum2\":"<<sum2<<",\"min\":"<<min<<",\"max\":"<<max<<",\"histogram\":[";for(int b=0;b<B;b++){if(b)o<<',';o<<h[b];}o<<"]}";}
};
struct Cell{Stat ca,pa;double cross=0;};
struct Accumulator{
 Cell cells[30];Stat attrs[2][A];
 void add(const Player& p){auto& c=cells[(p.age-15)*10+p.pos];c.ca.add(p.ca);c.pa.add(p.pa);c.cross+=p.ca*p.pa;for(int k=0;k<A;k++)attrs[p.pos==0?0:1][k].add(p.attributes[k]);}
 void write(const std::string& path,uint64_t start,uint64_t end,double seconds,bool vectorMath){
  std::ofstream o(path+".tmp");o<<std::setprecision(17)<<"{\"version\":1,\"start\":"<<start<<",\"end\":"<<end<<",\"count\":"<<end-start<<",\"seconds\":"<<seconds<<",\"vectorMath\":"<<(vectorMath?"true":"false")<<",\"cells\":[";
  for(int i=0;i<30;i++){if(i)o<<',';o<<"{\"age\":"<<15+i/10<<",\"position\":\""<<POS[i%10]<<"\",\"cross\":"<<cells[i].cross<<",\"ca\":";cells[i].ca.write(o);o<<",\"pa\":";cells[i].pa.write(o);o<<'}';}o<<"],\"attributes\":{\"GK\":[";
  for(int g=0;g<2;g++){if(g)o<<"],\"outfield\":[";for(int k=0;k<A;k++){if(k)o<<',';attrs[g][k].write(o);}}o<<"]}}\n";o.close();fs::rename(path+".tmp",path);
 }
};
int main(int argc,char** argv){
 if(argc>1&&std::string(argv[1])=="reference"){
  std::ifstream input(argv[2]);std::ofstream o(argv[3]);bool vectorMath=argc>4&&std::string(argv[4])=="vector";o<<std::setprecision(17)<<'[';uint64_t i;bool first=true;while(input>>i){auto p=generate(i,vectorMath);if(!first)o<<',';first=false;o<<"{\"index\":"<<i<<",\"ca\":"<<p.ca<<",\"pa\":"<<p.pa<<",\"attributes\":[";for(int k=0;k<A;k++){if(k)o<<',';o<<p.attributes[k];}o<<"]}";}o<<"]\n";return 0;
 }
 if(argc<5){std::cerr<<"usage: count threads shardSize folder [vector]\n";return 1;}
 uint64_t count=std::stoull(argv[1]),shardSize=std::stoull(argv[3]),jobs=(count+shardSize-1)/shardSize;int threads=std::stoi(argv[2]);std::string folder=argv[4];bool vectorMath=argc>5&&std::string(argv[5])=="vector";fs::create_directories(folder);
 std::atomic<uint64_t> next{0},complete{0};std::mutex log;auto begin=std::chrono::steady_clock::now();std::vector<std::thread> workers;
 for(int t=0;t<threads;t++)workers.emplace_back([&]{for(;;){uint64_t job=next.fetch_add(1);if(job>=jobs)break;uint64_t start=job*shardSize,end=std::min(count,start+shardSize);std::string file=folder+"/shard-"+std::to_string(job)+".json";if(!fs::exists(file)){auto acc=std::make_unique<Accumulator>();auto tick=std::chrono::steady_clock::now();for(uint64_t i=start;i<end;i++)acc->add(generate(i,vectorMath));acc->write(file,start,end,std::chrono::duration<double>(std::chrono::steady_clock::now()-tick).count(),vectorMath);}uint64_t done=complete.fetch_add(end-start)+(end-start);std::lock_guard<std::mutex> guard(log);std::cerr<<done<<"/"<<count<<" elapsed="<<std::chrono::duration<double>(std::chrono::steady_clock::now()-begin).count()<<"s\n";}});
 for(auto& w:workers)w.join();return 0;
}
