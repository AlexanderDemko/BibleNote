using System;
using System.Collections.Generic;
using System.Linq;
using System.Web.Optimization;

namespace Word.Web
{
    public class BundleConfig
    {        
        public static void RegisterBundles(BundleCollection bundles)
        {
            bundles.Add(new ScriptBundle("~/bundles/jquery").Include(
                "~/Scripts/jquery-{version}.js"));

            bundles.Add(new ScriptBundle("~/bundles/jqueryval").Include(
                "~/Scripts/jquery.unobtrusive*",
                "~/Scripts/jquery.validate*"));
            
            bundles.Add(new ScriptBundle("~/bundles/jqueryui").Include(
              "~/Scripts/jquery-ui-{version}.js"));

      

            bundles.Add(new ScriptBundle("~/bundles/dhtmlx").Include(
                "~/Scripts/dhtmlx/*.js"
                ));


            bundles.Add(new ScriptBundle("~/bundles/angular").Include("~/Scripts/angular.js",
              "~/Scripts/controllers/*.js", "~/Scripts/directives/*.js", "~/Scripts/services/*.js", "~/Scripts/modules/*.js"));


            bundles.Add(new ScriptBundle("~/bundles/word").Include(
                       "~/Scripts/behaviours/*.js"));

           bundles.Add(new ScriptBundle("~/bundles/modernizr").Include(
                "~/Scripts/modernizr-*"));

            bundles.Add(new ScriptBundle("~/bundles/bootstrap").Include(
                "~/Scripts/bootstrap.js",
                "~/Scripts/respond.js"));

            bundles.Add(new StyleBundle("~/Content/css").Include(
                 "~/Content/bootstrap.css",
                 "~/Content/Site.css",
                 "~/Content/dhtmlxribbon.css",
                 "~/Content/themes/base/*.css"));
        }
    }
}
