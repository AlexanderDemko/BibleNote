using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Web;
using System.Web.Mvc;
using Word.Model;

namespace Word.Web.Controllers
{
    public class RibbonController : Controller
    {
        
        // GET: Ribbon
        public ActionResult Get(string id)
        {
            var data = new RibbonSettings()
            {
                Parent = "ribbonObj",
                IconPath = "/imgs/",
                Groups = new List<RibbonItemGroup>
            {
                new RibbonItemGroup()
                    {
                    GroupType="block",
                    Title="Tags",
                    Mode="cols",
                    ItemsList = new List<RibbonItem>
                        {
                            new RibbonItem(){Id="pointer", ItemType="buttonSegment",Title="Pointer",IsButtonBig=true,ImagePath="cursor.png"},                    
                            new RibbonItem(){Id="author", ItemType="buttonSegment",Title="Author",IsButtonBig=false,ImagePath="author.png"},
                            new RibbonItem(){Id="receivers", ItemType="buttonSegment",Title="Receivers",IsButtonBig=false,ImagePath="receivers.png"}
                        }
                    }
            }
            };
            data.Parent = id;
            return Content(JsonConvert.SerializeObject(data));
        }
    }
}