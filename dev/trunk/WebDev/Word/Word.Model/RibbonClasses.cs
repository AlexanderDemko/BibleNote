using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Word.Model
{

    public class RibbonSettings
    {
        [Newtonsoft.Json.JsonProperty("parent")]
        public string Parent { get; set; }
        [Newtonsoft.Json.JsonProperty("icons_path")]
        public string IconPath { get; set; }
         [Newtonsoft.Json.JsonProperty("items", NullValueHandling = NullValueHandling.Ignore)]
        public IEnumerable<RibbonItemGroup> Groups { get; set; }

         [Newtonsoft.Json.JsonProperty("tabs", NullValueHandling = NullValueHandling.Ignore)]
        public IEnumerable<RibbonTab> Tabs { get; set; }
    }

    
    public class RibbonTab
    {
        [Newtonsoft.Json.JsonProperty("id")]
        public string Id { get; set; }
        [Newtonsoft.Json.JsonProperty("type")]
        public string GroupType { get; set; }
        [Newtonsoft.Json.JsonProperty("text")]
        public string Title { get; set; }
        [Newtonsoft.Json.JsonProperty("active")]
        public bool Active { get; set; }
         [Newtonsoft.Json.JsonProperty("items", NullValueHandling = NullValueHandling.Ignore)]
        public IEnumerable<RibbonItemGroup> Groups { get; set; }
    }
    
    public class RibbonItemGroup
    {
        [Newtonsoft.Json.JsonProperty("type")]
        public string GroupType { get; set; }
        [Newtonsoft.Json.JsonProperty("text")]
        public string Title { get; set; }
        [Newtonsoft.Json.JsonProperty("mode")]
        public string Mode { get; set; }
        [Newtonsoft.Json.JsonProperty("list", NullValueHandling = NullValueHandling.Ignore)]
        public IEnumerable<RibbonItem> ItemsList { get; set; }
    }
    
    public class RibbonItem
    {
        [Newtonsoft.Json.JsonProperty("id")]
        public string Id { get; set; }
        [Newtonsoft.Json.JsonProperty("type")]
        public string ItemType { get; set; }
        [Newtonsoft.Json.JsonProperty("text")]
        public string Title { get; set; }
        [Newtonsoft.Json.JsonProperty("isbig")]
        public bool IsButtonBig { get; set; }
        [Newtonsoft.Json.JsonProperty("img")]
        public string ImagePath { get; set; }
    }

}
