jQuery(document).ready( function() {

    stream = new String;    
    whichStream = new String;
    whichS();
    trackCheck(stream);

});

setInterval("trackCheck(stream)", 120000);
setInterval("whichS()", 60000);

function whichS(){
    var lastStream = whichStream;
    whichStream = jQuery('.mp3j_A_current').text();
    
    //event.preventDefault();
    
    //console.log('lastStream ' + lastStream);
    //console.log('whichStream ' + whichStream);
    
    if (whichStream === 'THEMESTREAM') {

        stream = 'theme';

    } else {

        stream = 'dub'
    
    }
    
    //console.log('whichS says' + stream);
    
    if (lastStream != '' && lastStream != whichStream) {
        trackCheck(stream);
       // console.log('Running trackCheck from whichS');
    }
}

function trackCheck(stream){
        
        //console.log('trackCheck says' + stream);
    
        var data = {
        action: 'currentTrack',
        stream: stream,
        security: wpAjax.ajaxnonce    
        };
    
    jQuery.post(
              wpAjax.ajaxurl,
              data,
              function(response)
              {
                // ERROR HANDLING
                if( !response.success )
                {
                    // No data came back, maybe a security error
                    if( !response.data )
                        jQuery( '#T_mp3j_0' ).html( 'AJAX ERROR: no response' );
                    else
                        jQuery( '#T_mp3j_0' ).html( response.data.error );
                }
                else
                    jQuery('#T_mp3j_0').html(decodeURIComponent(response.data));
                    console.log('Now Playing: ' + decodeURIComponent(response.data));
            } 
                
    )
}