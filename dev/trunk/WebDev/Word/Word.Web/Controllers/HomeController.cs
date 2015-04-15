using System;
using System.Collections.Generic;
using System.Linq;
using System.Web;
using System.Web.Mvc;

namespace Word.Web.Controllers
{
    [Authorize]
    [RequireHttps]
    public class HomeController : Controller
    {
        public ActionResult Index()
        {
            return View();
        }

        public ActionResult Canvas()
        {
            
            return View();
        }

        public ActionResult Ribbon()
        {

            return View("RibbonCanvas");
        }
        
    }
}
